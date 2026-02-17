// @ts-check

/**
 * 型定義のインポート
 * @typedef {import('./types.js').Log} Log
 * @typedef {import('./types.js').Check} Check
 * @typedef {import('./types.js').Profile} Profile
 */
import { EXERCISE, CALORIES, APP, BEER_COLORS, STYLE_COLOR_MAP, ALCOHOL_CONSTANTS, getCheckItemSpec } from './constants.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/**
 * タイムスタンプから「仮想的な日付（営業日）」を取得する
 * デフォルトは午前4:00までを「前日」とみなす
 * @param {number} [timestamp=Date.now()] - 判定する日時のタイムスタンプ(ms)
 * @returns {string} 'YYYY-MM-DD' 形式の日付文字列
 */
export const getVirtualDate = (timestamp = Date.now()) => {
    const rolloverHour = 4; // 設定画面で可変にしても良い
    const date = dayjs(timestamp);
    
    // 現在時刻が4時未満なら、前日の日付として扱う
    if (date.hour() < rolloverHour) {
        return date.subtract(1, 'day').format('YYYY-MM-DD');
    }
    return date.format('YYYY-MM-DD');

};

export const Calc = {
    
    getVirtualDate,

    /**
     * 基礎代謝(BMR)計算 (Mifflin-St Jeor Equation based)
     * @param {Profile} profile
     * @returns {number} 1日あたりの基礎代謝(kcal)
     */
    getBMR: (profile) => {
        const weight = Number((profile && profile.weight) ? profile.weight : APP.DEFAULTS.WEIGHT);
        const height = Number((profile && profile.height) ? profile.height : APP.DEFAULTS.HEIGHT);
        const age = Number((profile && profile.age) ? profile.age : APP.DEFAULTS.AGE);
        const gender = (profile && profile.gender) ? profile.gender : APP.DEFAULTS.GENDER;

        const k = 1000 / 4.186; // kJ -> kcal conversion roughly
        
        if(gender === 'male') {
            return ((0.0481 * weight) + (0.0234 * height) - (0.0138 * age) - 0.4235) * k;
        } else {
            return ((0.0481 * weight) + (0.0234 * height) - (0.0138 * age) - 0.9708) * k;
        }
    },

    /**
     * 現在のカロリー収支（バランス）を計算する
     * @param {Log[]} logs
     * @returns {number}
     */
    calculateBalance: (logs) => {
        if (!logs || !Array.isArray(logs)) return 0;
        return logs.reduce((total, log) => {
            return total + (log.kcal || 0);
        }, 0);
    },

    /**
     * アルコールの純粋カロリー計算 (内部用)
     * @param {number} ml 
     * @param {number} abv 
     * @param {number} carbPer100ml 
     * @returns {number} kcal
     */
    calculateAlcoholCalories: (ml, abv, carbPer100ml) => {
        const _ml = ml || 0;
        const _abv = abv || 0;
        const _carb = carbPer100ml || 0;

        const alcoholG = _ml * (_abv / 100) * ALCOHOL_CONSTANTS.ETHANOL_DENSITY;
        const alcoholKcal = alcoholG * 7.0;
        const carbKcal = (_ml / 100) * _carb * ALCOHOL_CONSTANTS.CARB_CALORIES;

        // ★修正: 合算結果を小数点第1位で丸める
        return Math.round((alcoholKcal + carbKcal) * 10) / 10;
    },

    /**
     * ビール摂取による借金計算 (負の値で返す)
     * @param {number} ml 
     * @param {number} abv 
     * @param {number} carbPer100ml 
     * @param {number} [count=1] 
     * @returns {number} kcal (negative)
     */
    calculateBeerDebit: (ml, abv, carbPer100ml, count = 1) => {
        const unitKcal = Calc.calculateAlcoholCalories(ml, abv, carbPer100ml);
        const totalKcal = unitKcal * (count || 1);
        return -Math.abs(totalKcal);
    },

    /**
     * 運動による消費カロリー計算
     * @param {number} mets 
     * @param {number} minutes 
     * @param {Profile} profile 
     * @returns {number} kcal
     */
    calculateExerciseBurn: (mets, minutes, profile) => {
        const _mets = mets || 6.0;
        const rate = Calc.burnRate(_mets, profile);
        // ★修正: 乗算結果を小数点第1位で丸める
        const totalBurn = (minutes || 0) * rate;
        return Math.round(totalBurn * 10) / 10;
    },

    /**
     * ストリークボーナス適用後の運動クレジット計算
     * @param {number} baseKcal 
     * @param {number} streak 
     * @returns {{kcal: number, bonusMultiplier: number}}
     */
    calculateExerciseCredit: (baseKcal, streak) => {
        const multiplier = Calc.getStreakMultiplier(streak);
        const finalKcal = Math.abs(baseKcal * multiplier);
        return {
            // ★修正: 小数点第1位で丸める
            kcal: Math.round(finalKcal * 10) / 10,
            bonusMultiplier: multiplier
        };
    },

    /**
     * 分間消費カロリー率 (kcal/min) の計算
     * @param {number} mets 
     * @param {Profile} profile 
     * @returns {number} kcal/min
     */
    burnRate: (mets, profile) => {
        const bmr = Calc.getBMR(profile);
        const netMets = Math.max(0, mets - 1);
        // (BMR / 24時間) * METs = 時給カロリー -> /60 で分給
        const rate = (bmr / 24 * netMets) / 60;
        return (rate && rate > 0.1) ? rate : 0.1;
    },

    /**
     * タンクアニメーション用の表示データ生成
     * @param {number} currentKcal 
     * @param {string} currentMode 
     * @param {Object} settings 
     * @param {Profile} profile 
     * @returns {Object}
     */
    getTankDisplayData: (currentKcal, currentMode, settings, profile) => {
        const modes = settings.modes || { mode1: APP.DEFAULTS.MODE1, mode2: APP.DEFAULTS.MODE2 };
        const baseEx = settings.baseExercise || APP.DEFAULTS.BASE_EXERCISE;

        const targetStyle = currentMode === 'mode1' ? modes.mode1 : modes.mode2;
        
        const unitKcal = CALORIES.STYLES[targetStyle] || 140; 
        const safeUnitKcal = unitKcal > 0 ? unitKcal : 140;
        
        const canCount = currentKcal / safeUnitKcal;
        const displayMinutes = Calc.convertKcalToMinutes(Math.abs(currentKcal), baseEx, profile);
        const baseExData = EXERCISE[baseEx] || EXERCISE['stepper'];
        
        const colorKey = STYLE_COLOR_MAP[targetStyle] || 'gold';
        const liquidColor = BEER_COLORS[colorKey] || BEER_COLORS['gold']; 
        const isHazy = colorKey === 'hazy';

        return {
            canCount,
            displayMinutes,
            baseExData,
            unitKcal: safeUnitKcal,
            targetStyle,
            liquidColor,
            isHazy
        };
    },

    /**
     * カロリーを運動時間に換算
     * @param {number} kcal 
     * @param {string} exerciseKey 
     * @param {Profile} profile 
     * @returns {number} minutes
     */
    convertKcalToMinutes: (kcal, exerciseKey, profile) => {
        const ex = EXERCISE[exerciseKey] || EXERCISE['stepper'];
        const mets = ex.mets;
        const rate = Calc.burnRate(mets, profile);
        return Math.round(kcal / rate);
    },

    /**
     * カロリーをビール本数に換算
     * @param {number} kcal 
     * @param {string} styleName 
     * @returns {string} 本数(toFixed(1))
     */
    convertKcalToBeerCount: (kcal, styleName) => {
        const unit = CALORIES.STYLES[styleName] || 140;
        const safeUnit = unit > 0 ? unit : 140;
        return (kcal / safeUnit).toFixed(1);
    },

    /**
     * 【修正版】現在の継続日数（ストリーク）を計算
     * 従来の引数(配列)を受け取り、内部でMapに変換して高速版を呼ぶ
     * @param {Log[]} logs 
     * @param {Check[]} checks 
     * @param {Profile} profile 
     * @param {number|string} [referenceDate=null]
     * @returns {number}
     */
    getCurrentStreak: (logs, checks, profile, referenceDate = null) => {
        const safeLogs = Array.isArray(logs) ? logs : [];
        const safeChecks = Array.isArray(checks) ? checks : [];

        if (safeLogs.length === 0 && safeChecks.length === 0) {
            return 0;
        }

        // 1. マップ作成（重い処理）
        const logMap = new Map();
        const checkMap = new Map();
        
        let minTs = Number.MAX_SAFE_INTEGER;
        let found = false;

        // ログのマップ化
        safeLogs.forEach(l => {
            if (l.timestamp < minTs) minTs = l.timestamp;
            found = true;

            const d = getVirtualDate(l.timestamp);
            if (!logMap.has(d)) logMap.set(d, { hasBeer: false, hasExercise: false, balance: 0 });
            
            const entry = logMap.get(d);
            if (l.type === 'beer') entry.hasBeer = true;
            if (l.type === 'exercise') entry.hasExercise = true;
            
            if (l.kcal !== undefined) {
                entry.balance += l.kcal;
            } else if (l.type === 'exercise') {
                const mets = EXERCISE[l.exerciseKey] ? EXERCISE[l.exerciseKey].mets : 3.0;
                const burn = Calc.calculateExerciseBurn(mets, l.minutes, profile);
                entry.balance += burn;
            } else if (l.type === 'beer') {
                entry.balance -= 140; 
            }
        });
        
        // チェックのマップ化
        safeChecks.forEach(c => {
            if (c.timestamp < minTs) minTs = c.timestamp;
            found = true;
            const d = getVirtualDate(c.timestamp);
            checkMap.set(d, c.isDryDay);
        });

        const firstDate = found ? dayjs(minTs).startOf('day') : dayjs();

        // 2. 高速版ロジックへ委譲
        return Calc.getStreakFromMap(logMap, checkMap, firstDate, referenceDate);
    },

    /**
     * 【最終安定版】高速ストリーク計算（救済措置・歴史修正・無限ループガード完備）
     * @param {Map} logMap 
     * @param {Map} checkMap 
     * @param {Object} firstDate (dayjs)
     * @param {number|string} [referenceDate=null]
     * @returns {number}
     */
    getStreakFromMap: (logMap, checkMap, firstDate, referenceDate = null) => {
        // 1. 判定基準日の決定（実時刻を仮想日付文字列に変換）
        const targetDate = referenceDate ? dayjs(referenceDate) : dayjs();
        const targetDateStr = Calc.getVirtualDate(targetDate.valueOf()); 
    
        const hasLogOnTarget = logMap.has(targetDateStr);
        const hasCheckOnTarget = checkMap.has(targetDateStr);

        // 2. 判定開始地点の決定
        // 基準日に何らかの記録があればその日から、なければ「まだ何もしてない今日」とみなし前日から遡る
        let checkDate = (hasLogOnTarget || hasCheckOnTarget) 
                    ? dayjs(targetDateStr) // 文字列から生成して時刻を00:00に正規化
                    : dayjs(targetDateStr).subtract(1, 'day');
    
        let streak = 0;
        let loopCount = 0; // 無限ループガード用

        while (true) {
            // 安全装置：10年分以上のループ、または最古の日付を超えたら終了
            loopCount++;
                if (loopCount > 3650 || checkDate.isBefore(firstDate, 'day')) break;
    
            const dateStr = checkDate.format('YYYY-MM-DD');
            const dayLogs = logMap.get(dateStr) || { hasBeer: false, hasExercise: false, balance: 0 };
            const isDry = checkMap.get(dateStr); // true | false | undefined

            // --- A. 【成功判定（ストリーク加算）】 ---
            // 手動休肝日 or お酒なし or 完済済み
            if (isDry === true || !dayLogs.hasBeer || (dayLogs.hasBeer && dayLogs.balance >= -0.1)) {
                streak++;
                checkDate = checkDate.subtract(1, 'day');
                continue;
            }

            // --- B. 【救済措置（ストリーク維持・カウント不変）】 ---
            // 記録がない(undefined)が、その前日が成功していればブリッジする
            const prevDate = checkDate.subtract(1, 'day');
            const prevStr = prevDate.format('YYYY-MM-DD');
            const prevLog = logMap.get(prevStr) || { hasBeer: false, hasExercise: false, balance: 0 };
            const prevCheck = checkMap.get(prevStr);

            const isPrevValid = (prevCheck === true) || 
                               (!prevLog.hasBeer && prevCheck !== false) || 
                               (prevLog.hasBeer && prevLog.balance >= -0.1);

            if (isDry === undefined && !dayLogs.hasBeer && isPrevValid) {
                checkDate = checkDate.subtract(1, 'day');
                continue;
            }

            // --- C. 【失敗判定（ストリーク終了）】 ---
            // 借金がある、または明確に「飲酒のみ（isDry === false）」の場合
            break;
        }

        return streak;
    },

    /**
     * ストリークボーナス倍率を返す
     * @param {number} streak 
     * @returns {number}
     */
    getStreakMultiplier: (streak) => {
        if (streak >= 14) return 1.3;
        if (streak >= 7) return 1.2;
        if (streak >= 3) return 1.1;
        return 1.0;
    },

    /**
     * 最新のランク（LIVER RANK）を判定する
     * @param {Check[]} checks 
     * @param {Log[]} logs 
     * @param {Profile} profile 
     * @returns {Object} ランク情報
     */
    getRecentGrade: (checks, logs, profile) => {
        const safeLogs = Array.isArray(logs) ? logs : [];
        const safeChecks = Array.isArray(checks) ? checks : [];

        const now = dayjs();
        let firstDate = now;
        if (safeLogs.length > 0) {
            safeLogs.forEach(l => { if (dayjs(l.timestamp).isBefore(firstDate)) firstDate = dayjs(l.timestamp); });
        }
        if (safeChecks.length > 0) {
            safeChecks.forEach(c => { if (dayjs(c.timestamp).isBefore(firstDate)) firstDate = dayjs(c.timestamp); });
        }
        
        // 【修正後】 時間を切り捨てて「日付」同士で比較する
        const daysSinceStart = now.startOf('day').diff(firstDate.startOf('day'), 'day') + 1;
        const isRookie = daysSinceStart <= 14;
        
        const recentSuccessDays = Calc.getCurrentStreak(safeLogs, safeChecks, profile);

        if (isRookie) {
            const rate = daysSinceStart > 0 ? (recentSuccessDays / daysSinceStart) : 0;
            
            if (rate >= 0.7) return { rank: 'Rookie S', label: '新星', color: 'text-orange-500', bg: 'bg-orange-100', next: 1, current: recentSuccessDays, isRookie: true, rawRate: rate, targetRate: 1.0 };
            if (rate >= 0.4) return { rank: 'Rookie A', label: '期待の星', color: 'text-indigo-500', bg: 'bg-indigo-100', next: 1, current: recentSuccessDays, isRookie: true, rawRate: rate, targetRate: 0.7 };
            if (rate >= 0.25) return { rank: 'Rookie B', label: '駆け出し', color: 'text-green-500', bg: 'bg-green-100', next: 1, current: recentSuccessDays, isRookie: true, rawRate: rate, targetRate: 0.4 };
            return { rank: 'Beginner', label: 'たまご', color: 'text-gray-500', bg: 'bg-gray-100', next: 1, current: recentSuccessDays, isRookie: true, rawRate: rate, targetRate: 0.25 };
        }

        // ラベルから絵文字を除去
        if (recentSuccessDays >= 20) return { rank: 'S', label: '神の肝臓', color: 'text-purple-600', bg: 'bg-purple-100', next: null, current: recentSuccessDays };
        if (recentSuccessDays >= 12) return { rank: 'A', label: '鉄の肝臓', color: 'text-indigo-600', bg: 'bg-indigo-100', next: 20, current: recentSuccessDays };
        if (recentSuccessDays >= 8)  return { rank: 'B', label: '健康志向', color: 'text-green-600', bg: 'bg-green-100', next: 12, current: recentSuccessDays };
        
        return { rank: 'C', label: '要注意', color: 'text-red-500', bg: 'bg-red-50', next: 8, current: recentSuccessDays };
    },

    /**
     * 借金返済のための運動提案
     * @param {number} debtKcal 
     * @param {Profile} profile 
     * @returns {Object|null}
     */
    getRedemptionSuggestion: (debtKcal, profile) => {
        const debt = Math.abs(debtKcal || 0);
        if (debt < 50) return null; 

        const exercises = ['hiit', 'running', 'stepper', 'walking'];
        const candidates = exercises.map(key => {
            const ex = EXERCISE[key];
            const rate = Calc.burnRate(ex.mets, profile);
            const mins = Math.ceil(debt / rate);
            return { key, label: ex.label, mins, icon: ex.icon };
        });

        const best = candidates.find(c => c.mins <= 30) || candidates.find(c => c.mins <= 60) || candidates[0];
        
        return best;
    },

    /**
     * 指定日にアルコールログがあるか確認
     * @param {Log[]} logs 
     * @param {number} timestamp 
     * @returns {boolean}
     */
    hasAlcoholLog: (logs, timestamp) => {
        const target = dayjs(timestamp);
        return logs.some(l => l.type === 'beer' && dayjs(l.timestamp).isSame(target, 'day'));
    },

    /**
     * その日の状態ステータスを取得（カレンダー用）
     * @param {string|number} date 
     * @param {Log[]} logs 
     * @param {Check[]} checks 
     * @param {Profile} profile 
     * @returns {string} status_key
     */
    getDayStatus: (date, logs, checks, profile) => {
        const d = dayjs(date);
        const dayStart = d.startOf('day').valueOf();
        const dayEnd = d.endOf('day').valueOf();

        const dayLogs = logs.filter(l => l.timestamp >= dayStart && l.timestamp <= dayEnd);
        const dayCheck = checks.find(c => c.timestamp >= dayStart && c.timestamp <= dayEnd);

        const hasBeer = dayLogs.some(l => l.type === 'beer');
        const hasExercise = dayLogs.some(l => l.type === 'exercise');
        const isDryDay = dayCheck ? dayCheck.isDryDay : false;

        let balance = 0;
        dayLogs.forEach(l => {
            const val = l.kcal !== undefined ? l.kcal : (l.type === 'exercise' ? (l.minutes * Calc.burnRate(6.0, profile)) : -150);
            balance += val;
        });

        if (isDryDay) return hasExercise ? 'rest_exercise' : 'rest';
        if (hasBeer) {
            if (hasExercise) {
                return balance >= 0 ? 'drink_exercise_success' : 'drink_exercise';
            }
            return 'drink';
        }
        if (hasExercise) return 'exercise';
        return 'none';
    },

    /**
     * ビール統計情報の生成
     * @param {Log[]} allLogs 
     * @returns {Object} stats
     */
    getBeerStats: (allLogs) => {
        const beerLogs = allLogs.filter(l => l.type === 'beer');
        
        const totalCount = beerLogs.reduce((sum, l) => sum + (l.count || 1), 0);
        const totalMl = beerLogs.reduce((sum, l) => sum + (l.rawAmount || (l.size * (l.count || 1)) || 0), 0);
        const totalKcal = beerLogs.reduce((sum, l) => sum + Math.abs(l.kcal || 0), 0);

        const styleCounts = {};
        const statsMap = new Map(); 

        beerLogs.forEach(l => {
            const s = l.style || 'Unknown';
            styleCounts[s] = (styleCounts[s] || 0) + (l.count || 1);

            const brewery = l.brewery ? l.brewery.trim() : 'Unknown';
            const brand = l.brand ? l.brand.trim() : (l.name || 'Unknown Beer');
            const key = `${brewery}|${brand}`;

            if (!statsMap.has(key)) {
                statsMap.set(key, {
                    brewery: brewery === 'Unknown' ? '' : brewery,
                    name: brand,
                    count: 0,
                    totalMl: 0,
                    ratings: [],
                    lastDrank: 0,
                    style: s
                });
            }
            
            const entry = statsMap.get(key);
            entry.count += (l.count || 1);
            entry.totalMl += (l.rawAmount || (l.size * (l.count || 1)) || 0);
            if (l.rating > 0) entry.ratings.push(l.rating);
            if (l.timestamp > entry.lastDrank) entry.lastDrank = l.timestamp;
        });

        const uniqueBeers = statsMap.size;

        const topStyles = Object.entries(styleCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([style, count]) => ({ style, count }));

        const beerStats = Array.from(statsMap.values()).map(item => ({
            ...item,
            averageRating: item.ratings.length ? (item.ratings.reduce((a,b)=>a+b,0) / item.ratings.length) : 0
        })).sort((a, b) => b.count - a.count); 

        // ブルワリー別集計
        const breweryMap = new Map();
        statsMap.forEach((item) => {
            const bKey = item.brewery || 'Unknown';
            if (!breweryMap.has(bKey)) {
                breweryMap.set(bKey, {
                    brewery: bKey,
                    totalCount: 0,
                    totalMl: 0,
                    ratings: [],
                    abvs: [],
                    styles: new Set(),
                    beers: new Set(),
                    lastDrank: 0
                });
            }
            const bEntry = breweryMap.get(bKey);
            bEntry.totalCount += item.count;
            bEntry.totalMl += item.totalMl;
            item.ratings.forEach(r => bEntry.ratings.push(r));
            bEntry.styles.add(item.style);
            bEntry.beers.add(item.name);
            if (item.lastDrank > bEntry.lastDrank) bEntry.lastDrank = item.lastDrank;
        });

        // ABV情報をログから直接取得
        beerLogs.forEach(l => {
            const bKey = l.brewery ? l.brewery.trim() : 'Unknown';
            const bEntry = breweryMap.get(bKey);
            if (bEntry && l.abv > 0) bEntry.abvs.push(l.abv);
        });

        const breweryStats = Array.from(breweryMap.values()).map(item => ({
            brewery: item.brewery,
            totalCount: item.totalCount,
            totalMl: item.totalMl,
            uniqueBeers: item.beers.size,
            styleCount: item.styles.size,
            styles: [...item.styles],
            averageRating: item.ratings.length ? (item.ratings.reduce((a,b) => a+b, 0) / item.ratings.length) : 0,
            ratingCount: item.ratings.length,
            averageAbv: item.abvs.length ? (item.abvs.reduce((a,b) => a+b, 0) / item.abvs.length) : 0,
            lastDrank: item.lastDrank
        }));

        return {
            totalCount,
            totalMl,
            totalKcal,
            styleCounts,
            topStyles,
            uniqueBeersCount: uniqueBeers,
            logsCount: beerLogs.length,
            beerStats: beerStats,
            breweryStats: breweryStats
        };
    },

    /**
     * 体重ベースの週間アルコール上限(g)を算出
     * Widmark因子(男性0.68/女性0.55)で補正し、60kg男性=20g/日を基準にスケーリング
     * @param {Profile} profile
     * @returns {number} 週あたりの純アルコール上限(g)
     */
    getWeeklyAlcoholLimit: (profile) => {
        const weight = Number((profile && profile.weight) ? profile.weight : APP.DEFAULTS.WEIGHT);
        const gender = (profile && profile.gender) ? profile.gender : APP.DEFAULTS.GENDER;
        const r = gender === 'male' ? 0.68 : 0.55;

        const baseDailyG = 20;  // 厚労省基準: 60kg成人男性で20g/日
        const baseWeight = 60;
        const baseR = 0.68;     // 男性基準

        const adjusted = baseDailyG * (weight / baseWeight) * (r / baseR);
        const daily = Math.max(12, Math.min(30, Math.round(adjusted)));
        return daily * 7;
    },

    /**
     * ビール1杯あたりの純アルコール量(g)を計算
     * 計算式: ml × (ABV / 100) × 0.789(エタノール比重)
     * @param {number} ml - 容量
     * @param {number} abv - アルコール度数(%)
     * @param {number} [count=1] - 杯数
     * @returns {number} 純アルコール量(g)
     */
    calcPureAlcohol: (ml, abv, count = 1) => {
        const _ml = ml || 0;
        const _abv = abv || 0;
        return Math.round(_ml * (_abv / 100) * ALCOHOL_CONSTANTS.ETHANOL_DENSITY * (count || 1) * 10) / 10;
    },

    /**
     * ログ配列から純アルコール合計(g)を計算
     * @param {Log[]} logs
     * @returns {number}
     */
    calcTotalPureAlcohol: (logs) => {
        if (!logs || !Array.isArray(logs)) return 0;
        return logs
            .filter(l => l.type === 'beer')
            .reduce((sum, l) => {
                const ml = l.ml || l.size || 350;
                const abv = l.abv || 5.0;
                const count = l.count || 1;
                return sum + Calc.calcPureAlcohol(ml, abv, count);
            }, 0);
    },

    /**
     * デイリーチェックの達成率スコアを算出（カテゴリ別）
     * @param {Check} check - チェックレコード
     * @param {'all'|'state'|'action'|'training'} metric - 集計カテゴリ
     * @returns {number|null} 0.0〜1.0 のスコア、対象項目なしなら null
     */
    calcCheckScoreByMetric: (check, metric = 'all') => {
        if (!check) return null;
        const fixedKeys = new Set(['isDryDay', 'weight', 'isSaved', 'date', 'timestamp', 'id']);

        const items = Object.entries(check)
            .filter(([key, val]) => !fixedKeys.has(key) && typeof val === 'boolean')
            .map(([key, val]) => {
                const spec = getCheckItemSpec(key);
                const metricType = (spec && spec.metricType) ? spec.metricType : 'action';
                return { key, val, metricType, drinkingOnly: !!(spec && spec.drinking_only) };
            });

        const filteredByMetric = metric === 'all'
            ? items
            : items.filter(i => i.metricType === metric);

        // 休肝日なら drinking_only 項目を除外
        const relevant = check.isDryDay
            ? filteredByMetric.filter(i => !i.drinkingOnly)
            : filteredByMetric;

        if (relevant.length === 0) return null;

        return relevant.filter(i => i.val).length / relevant.length;
    },

    /**
     * デイリーチェックの体調スコア（後方互換）
     * @param {Check} check
     * @returns {number|null}
     */
    calcConditionScore: (check) => {
        return Calc.calcCheckScoreByMetric(check, 'all');
    },

    /**
     * 状態スコア（state）
     * @param {Check} check
     * @returns {number|null}
     */
    calcStateScore: (check) => {
        return Calc.calcCheckScoreByMetric(check, 'state');
    },

    /**
     * セルフケア実行率（action）
     * @param {Check} check
     * @returns {number|null}
     */
    calcActionScore: (check) => {
        return Calc.calcCheckScoreByMetric(check, 'action');
    },

    /**
     * SNSシェア用のテキスト生成
     * @param {Log} log
     * @param {number} [balanceKcal=0]
     * @returns {string}
     */
    generateShareText: (log, balanceKcal = 0) => {
        const hashtags = APP.HASHTAGS;
        const balance = Math.round(balanceKcal);
        let text = '';

        if (log.type === 'beer') {
            const name = log.brand || log.name;
            const amount = log.rawAmount || log.size || 350;
            const count = log.count > 1 ? `x${log.count}` : '';
            const kcal = Math.abs(Math.round(log.kcal));
            
            // 飲酒報告
            text = `🍺 ${name} (${amount}ml${count}) を飲んで ${kcal}kcal の借金を背負いました...💸\n`;
            if (balance < 0) {
                text += `現在の借金総額: ${Math.abs(balance)}kcal 😱\n`;
            } else {
                text += `でも貯金があるから実質ゼロカロリー！✨ (+${balance}kcal)\n`;
            }

        } else if (log.type === 'exercise') {
            const name = log.name;
            const mins = log.minutes;
            const kcal = Math.round(log.kcal);
            
            // 運動報告
            text = `🏃‍♀️ ${name}を${mins}分やって、${kcal}kcal 返済しました！\n`;
            if (balance >= 0) {
                text += `ついに借金完済！今夜のビールが美味い！🍻\n`;
            } else {
                text += `完済まであと ${Math.abs(balance)}kcal... 頑張るぞ💪\n`;
            }
        } else if (log.isDryDay) {
            // 休肝日
            text = `🍵 今日は休肝日！肝臓をいたわっています。\n`;
        }

        return `${text} ${hashtags}`;
    }
};


