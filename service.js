import { db, Store } from './store.js';
import { Calc, getVirtualDate } from './logic.js';
import { APP, EXERCISE, STYLE_SPECS } from './constants.js';
// UIオブジェクトではなく、機能を直接インポート
import { showMessage, showConfetti, Feedback, showToastAnimation } from './ui/dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// ヘルパー: 月曜始まりの週頭を取得
const getStartOfWeek = (date = undefined) => {
    const d = dayjs(date);
    const day = d.day() || 7; // Sun(0)を7に変換 (Mon=1 ... Sun=7)
    return d.subtract(day - 1, 'day').startOf('day');
};

export const Service = {

    /**
     * UI表示用にデータを取得する
     * Permanentモードなら全期間、それ以外なら期間開始日以降のデータを返す
     */

getAllDataForUI: async () => {
    const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || 'weekly';
    const startStr = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START);
    const start = startStr ? parseInt(startStr) : 0;

    // 1. 全データ（表示用）
    const allLogs = await db.logs.toArray();
    const checks = await db.checks.toArray();
    
    // ★修正: db.logsから削除しない運用に変えたため、アーカイブとの結合は不要（重複する）
    // アーカイブテーブルは「サマリー情報の保持」としてのみ利用し、生ログはdb.logsを正とする
    const mergedLogs = allLogs;

    // 2. 期間内データ（借金計算用）
    let periodLogs = allLogs;
    if (mode !== 'permanent') {
        periodLogs = allLogs.filter(l => l.timestamp >= start);
    }

    // ★追加: シェア機能等のためにデータをキャッシュ
        // 第1引数: 全期間ログ (ランク計算用)
        // 第2引数: 全チェック
        // 第3引数: 期間内ログ (収支計算用)
        Store.setCachedData(mergedLogs, checks, periodLogs);

    // 呼び出し側（main/ui）に合わせて3つ返却する
    return { logs: periodLogs, checks, allLogs: mergedLogs };
},


    getLogsWithPagination: async (offset, limit) => {
        const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || 'weekly';
        let logs, totalCount;

        if (mode === 'permanent') {
            totalCount = await db.logs.count();
            logs = await db.logs.orderBy('timestamp').reverse().offset(offset).limit(limit).toArray();
        } else {
            const periodStart = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START)) || 0;
            totalCount = await db.logs.where('timestamp').aboveOrEqual(periodStart).count();
            logs = await db.logs.where('timestamp').aboveOrEqual(periodStart).reverse().offset(offset).limit(limit).toArray();
        }

        return { logs, totalCount };
    },

    ensureTodayCheckRecord: async () => {
        const todayStr = getVirtualDate(); 
        
        // startOfDay / endOfDay も仮想日付ベースで計算
        const vDate = dayjs(todayStr);
        const startOfDay = vDate.startOf('day').valueOf();
        const endOfDay = vDate.endOf('day').valueOf();

        try {
            const existing = await db.checks.where('timestamp').between(startOfDay, endOfDay).first();
            if (!existing) {
                // レコードがなければ空で作る（チェック忘れ防止のUXのため）
                await db.checks.add({
                    timestamp: dayjs().valueOf(),
                    isDryDay: false,
                    waistEase: false,
                    footLightness: false,
                    waterOk: false,
                    fiberOk: false,
                    weight: null
                });
            }
        } catch (e) {
            console.error('[Service] Failed to ensure today check record:', e);
        }
    },

    /**
     * 履歴の再計算（Race Condition対策済み版）
     * トランザクション内で実行することで、計算中のデータ競合を防ぐ
     */
    recalcImpactedHistory: async (changedTimestamp) => {
        // 'rw' (読み書き) モードでトランザクションを開始
        // logs, checks, period_archives の3つのテーブルをロックします
        return db.transaction('rw', db.logs, db.checks, db.period_archives, async () => {
            
            // 1. 全データを取得（計算用）
            // トランザクション内なので、この時点でデータはロックされています
            const allLogs = await db.logs.toArray();
            const allChecks = await db.checks.toArray();
            const profile = Store.getProfile();

            // --- Optimization: Pre-calculate Maps to avoid O(N^2) ---
            const logMap = new Map();
            const checkMap = new Map();
            let minTs = Number.MAX_SAFE_INTEGER;
            let found = false;

            allLogs.forEach(l => {
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
                    // ★修正: 固定値 -140 をやめ、データから算出
                    const ml = parseInt(l.size) || 350;
                    const abv = parseFloat(l.abv) || 5.0;
                    const spec = STYLE_SPECS[l.style] || { carb: 3.0 };
                    entry.balance += Calc.calculateBeerDebit(ml, abv, spec.carb, l.count || 1);
                }
            });

            allChecks.forEach(c => {
                if (c.timestamp < minTs) minTs = c.timestamp;
                found = true;
                const d = getVirtualDate(c.timestamp);
                checkMap.set(d, c.isDryDay);
            });

            const firstDate = found ? dayjs(minTs).startOf('day') : dayjs();

            // 運動ログを日付で高速検索するためのMapを作成
            const exerciseLogsByDate = new Map();
            allLogs.forEach(l => {
                if (l.type === 'exercise') {
                    const dStr = getVirtualDate(l.timestamp);
                    if (!exerciseLogsByDate.has(dStr)) {
                        exerciseLogsByDate.set(dStr, []);
                    }
                    exerciseLogsByDate.get(dStr).push(l);
                }
            });

            // ----------------------------------------

            // 2. 変更日以降のすべての日付について再計算
            const startDate = dayjs(changedTimestamp).startOf('day');
            const today = dayjs().endOf('day');
            
            let currentDate = startDate;
            let updateCount = 0;
            let safeGuard = 0;

            while (currentDate.isBefore(today) || currentDate.isSame(today, 'day')) {
                if (safeGuard++ > 3650) break; // 無限ループ防止

                // その日の文字列キーを取得
                const dateStr = currentDate.format('YYYY-MM-DD');
                
                // その時点でのStreak (Optimized call)
                const streak = Calc.getStreakFromMap(logMap, checkMap, firstDate, currentDate);
                
                // ボーナス倍率
                const creditInfo = Calc.calculateExerciseCredit(100, streak); // 100はダミー
                const bonusMultiplier = creditInfo.bonusMultiplier;

                // ▼▼▼ 修正: Mapから一発で取得 (filterを使わない) ▼▼▼
                const daysExerciseLogs = exerciseLogsByDate.get(dateStr) || [];
                // ▲▲▲ 修正終了 ▲▲▲
                
                for (const log of daysExerciseLogs) {
                    const profile = Store.getProfile(); // ループ内だが軽量なので許容、あるいはループ外に出すとなお良し
                    const mets = EXERCISE[log.exerciseKey] ? EXERCISE[log.exerciseKey].mets : 3.0;
                    const baseBurn = Calc.calculateExerciseBurn(mets, log.minutes, profile);
                    const updatedCredit = Calc.calculateExerciseCredit(baseBurn, streak);
                    
                    // メモ欄の更新（"Streak Bonus x1.2" のような文字列を置換）
                    let newMemo = log.memo || '';
                    newMemo = newMemo.replace(/Streak Bonus x[0-9.]+/g, '').trim();
                    
                    if (bonusMultiplier > 1.0) {
                        const bonusTag = `Streak Bonus x${bonusMultiplier.toFixed(1)}`;
                        newMemo = newMemo ? `${newMemo} ${bonusTag}` : bonusTag;
                    }

                    // 値が変わる場合のみDB更新
                    // トランザクション内なので await しても安全です
                    if (Math.abs(log.kcal - updatedCredit.kcal) > 0.1 || log.memo !== newMemo) {
                        await db.logs.update(log.id, {
                            kcal: updatedCredit.kcal,
                            memo: newMemo
                        });

                        const entry = logMap.get(dateStr);
                        if (entry) {
                            const diff = updatedCredit.kcal - (log.kcal || 0);
                            entry.balance += diff; // 地図上の残高を更新！
                            log.kcal = updatedCredit.kcal; // ログオブジェクトも更新
                        }
                        updateCount++;
                    }
                }

                currentDate = currentDate.add(1, 'day');
            }

            if (updateCount > 0) {
                console.log(`[Service] Recalculated ${updateCount} exercise logs due to streak change.`);
            }

            // 3. 過去アーカイブ（期間確定済みデータ）の再集計
            try {
                // トランザクション内なので一貫性が保たれます
                const affectedArchives = await db.period_archives.where('endDate').aboveOrEqual(changedTimestamp).toArray();
                
                for (const archive of affectedArchives) {
                    // ★修正: if (archive.startDate <= changedTimestamp) を削除
                    // 理由: ストリーク変更の影響は未来に及ぶため、修正日より後に開始したアーカイブも更新する必要があるからです。
                    
                    // queryでendDateによる絞り込みは済んでいるため、ここは無条件で更新してOKです
                    // もし念を入れるなら if (archive.endDate >= changedTimestamp) ですが、クエリと同じ意味なので省略可
                        const periodLogs = await db.logs.where('timestamp').between(archive.startDate, archive.endDate, true, true).toArray();
                        const totalBalance = periodLogs.reduce((sum, log) => sum + (log.kcal || 0), 0);
                        
                        // ▼▼▼ 修正: logs (中身の配列) も最新状態で上書きする ▼▼▼
                        await db.period_archives.update(archive.id, {
                            totalBalance: totalBalance,
                            logs: periodLogs, // <--- これを追加！ これで「ゾンビログ」が消滅します
                            updatedAt: Date.now()
                        });
                        // ▲▲▲ 修正終了 ▲▲▲
                }
            } catch (e) {
                console.error('[Service] Failed to update archives within transaction:', e);
                throw e; // エラーを投げてトランザクションをロールバックさせる
            }
        });
    },

    updatePeriodSettings: async (newMode) => {
        const currentMode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE);
        if (currentMode === newMode) return;

        localStorage.setItem(APP.STORAGE_KEYS.PERIOD_MODE, newMode);

        // Permanentモードへの切り替え: アーカイブを全てメインログに戻す（復元）
        if (newMode === 'permanent') {
            const archives = await db.period_archives.toArray();
            if (archives.length > 0) {
                let restoredCount = 0;
                for (const arch of archives) {
                    if (arch.logs && arch.logs.length > 0) {
                        // IDを除外して追加（ID衝突回避のため）
                        const logsToRestore = arch.logs.map(({id, ...rest}) => rest);
                        await db.logs.bulkAdd(logsToRestore);
                        restoredCount += logsToRestore.length;
                    }
                }
                // アーカイブは空にする
                await db.period_archives.clear();
                localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, 0); // 全期間
                showMessage(`${restoredCount}件の過去ログを復元しました`, 'success');
            }
        } else {
            // 通常モードへの切り替え: 開始日を再計算
            const start = Service.calculatePeriodStart(newMode);
            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, start);
        }
    },

    calculatePeriodStart: (mode) => {
        const now = dayjs();
        if (mode === 'weekly') {
            return getStartOfWeek(now).valueOf();
        } else if (mode === 'monthly') {
            return now.startOf('month').valueOf();
        } else if (mode === 'custom') {
            // カスタム期間は「現在」を起点にする
            return now.startOf('day').valueOf();
        }
        return 0;
    },

    // ★修正: 自動リセット処理を抜本的に変更
    checkPeriodRollover: async () => {
        const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || APP.DEFAULTS.PERIOD_MODE;
        
        // Permanentモードならリセットしない
        if (mode === 'permanent') return false;

        const storedStart = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START));
        
        // 初回起動時など
        if (!storedStart) {
            const newStart = Service.calculatePeriodStart(mode);
            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, newStart);
            return false;
        }

        const now = dayjs();
        let nextStart = null;

        // --- A. Weekly / Monthly (自動更新) ---
        if (mode === 'weekly') {
            const currentWeekStart = getStartOfWeek(now);
            const startDate = dayjs(storedStart);
            if (!currentWeekStart.isSame(startDate, 'day')) {
                // 週が変わっている -> 自動アーカイブ実行
                nextStart = currentWeekStart.valueOf();
                await Service.archiveAndReset(storedStart, nextStart, mode);
                return true; // -> UI側で「Weekly Report」モーダルを表示
            }
        } else if (mode === 'monthly') {
            const currentMonthStart = now.startOf('month');
            const startDate = dayjs(storedStart);
            if (!currentMonthStart.isSame(startDate, 'day')) {
                // 月が変わっている -> 自動アーカイブ実行
                nextStart = currentMonthStart.valueOf();
                await Service.archiveAndReset(storedStart, nextStart, mode);
                return true; // -> UI側で「Monthly Report」モーダルを表示
            }
        } 
        // --- B. Custom (手動更新待機) ---
        else if (mode === 'custom') {
            const endDateTs = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE));
            
            // 終了日が設定されており、かつ今日がその日を過ぎている場合
            if (endDateTs && now.isAfter(dayjs(endDateTs).endOf('day'))) {
                // ★アーカイブは実行しない
                // UI側に「期間終了」だけを伝え、選択肢を表示させる
                return true; 
            }
        }

        return false;
    },

    // ★追加: アーカイブ作成と期間リセットを行う独立メソッド
    // checkPeriodRollover から切り出しました
    archiveAndReset: async (currentStart, nextStart, mode) => {
        return db.transaction('rw', db.logs, db.period_archives, async () => {
            // 次の期間開始日より前のログを全て取得
            const logsToArchive = await db.logs.where('timestamp').below(nextStart).toArray();
            
            if (logsToArchive.length > 0) {
                // 既に同じ開始日のアーカイブが存在しないかチェック
                const existingArchive = await db.period_archives
                    .where('startDate').equals(currentStart)
                    .first();

                if (!existingArchive) {
                    const totalBalance = logsToArchive.reduce((sum, l) => sum + (l.kcal || 0), 0);
                    
                    await db.period_archives.add({
                        startDate: currentStart,
                        endDate: nextStart - 1,
                        mode: mode,
                        totalBalance: totalBalance,
                        logs: logsToArchive, 
                        createdAt: Date.now()
                    });
                } else {
                    console.warn('[Service] Archive for this period already exists. Skipping creation.');
                }
            }

            // 期間開始日を更新
            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, nextStart);
        });
    },

    /**
     * ★追加: よく飲むビールを取得（ランキング集計）
     * Recordタブで使用 (Frequency)
     */
    getFrequentBeers: async (limit = 3) => {
        const logs = await db.logs.where('type').equals('beer').toArray();
        const stats = Calc.getBeerStats(logs);
        const rankedBeers = stats.beerStats || [];
        return rankedBeers.slice(0, limit);
    },

    /**
     * ★修正: 直近のビールログを取得
     * インデックスに頼らず、全ログを「登録順(ID降順)」で取得してJS側でフィルタリングする
     * これにより、確実に「さっき登録したデータ」を取得できます。
     */
    getRecentBeers: async (limit = 2) => {
        // 1. 最新のログ100件をID降順（新しい順）で取得
        const logs = await db.logs.toCollection().reverse().limit(100).toArray();
        
        const uniqueMap = new Map();
        const recents = [];
        
        for (const log of logs) {
            // ビール以外はスキップ
            if (log.type !== 'beer') continue;

            // 銘柄が違えば別物とみなす
            // ブランドがある場合は "Brand_Name"、ない場合は "_Name"
            const key = `${log.brand || ''}_${log.name}`;
            
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, true);
                recents.push(log);
            }
            if (recents.length >= limit) break;
        }
        return recents;
    },

    /**
     * ★追加: よくやる運動を取得（頻度順）
     * Recordタブで使用 (Frequency)
     */
    getFrequentExercises: async (limit = 5) => {
        // 1. 直近100件取得
        const logs = await db.logs.where('type').equals('exercise').reverse().limit(100).toArray();

        // 2. 集計
        const stats = {};
        logs.forEach(log => {
            const key = `${log.name}_${log.minutes}`;
            if (!stats[key]) {
                stats[key] = { count: 0, data: log, lastSeen: log.timestamp };
            }
            stats[key].count++;
            if (log.timestamp > stats[key].lastSeen) {
                stats[key].lastSeen = log.timestamp;
                stats[key].data = log;
            }
        });

        // 3. ソートして上位N件を返す
        return Object.values(stats)
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count; // 回数優先
                return b.lastSeen - a.lastSeen; // 新しさ優先
            })
            .map(item => item.data)
            .slice(0, limit);
    },

    /**
     * ★修正: 直近の運動ログを取得
     * こちらも同様にID降順で取得するように変更
     */
    getRecentExercises: async (limit = 2) => {
        // 1. 最新のログ100件をID降順（新しい順）で取得
        const logs = await db.logs.toCollection().reverse().limit(100).toArray();
        
        const uniqueMap = new Map();
        const recents = [];
        
        for (const log of logs) {
            // 運動以外はスキップ
            if (log.type !== 'exercise') continue;
            
            if (!log.exerciseKey) continue;

            const key = `${log.exerciseKey}-${log.minutes}`;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, true);
                recents.push(log);
            }
            if (recents.length >= limit) break;
        }
        return recents;
    },

    /**
     * ログを複製して今日の日付で登録（リピート機能）
     * UI/index.js から呼ばれる
     */
    repeatLog: async (log) => {
        if (log.type === 'beer') {
            await Service.saveBeerLog({
                ...log,
                timestamp: Date.now(),
                isCustom: log.isCustom || false,
                useUntappd: false // クイック登録時は自動で開かない
            }, null);
        } else {
            await Service.saveExerciseLog(
                log.exerciseKey,
                log.minutes,
                getVirtualDate(),
                true, // リピート時は常にボーナス適用
                null
            );
        }
        // saveBeerLog/saveExerciseLog 内で再計算とUI更新イベントが発火するため、ここでの記述は不要
    },

    // --- 以下、シェア機能追加のために修正されたメソッド ---

    saveBeerLog: async (data, id = null) => {
        let name, kcal, abv, carb;

        if (data.isCustom) {
            // カスタム入力
            name = data.type === 'dry' ? '蒸留酒 (糖質ゼロ)' : '醸造酒/カクテル';
            abv = data.abv;
            const ml = data.ml;
            carb = data.type === 'dry' ? 0.0 : 3.0;
            kcal = Calc.calculateBeerDebit(ml, abv, carb, 1);
        } else {
            // プリセット選択
            const spec = STYLE_SPECS[data.style] || STYLE_SPECS['Custom'];
            abv = (data.userAbv !== undefined && !isNaN(data.userAbv)) ? data.userAbv : spec.abv;
            carb = spec.carb;
            
            const sizeMl = parseInt(data.size); 
            kcal = Calc.calculateBeerDebit(sizeMl, abv, carb, data.count);
            name = `${data.style}`;
            if (data.count !== 1) name += ` x${data.count}`;
        }

        const logData = {
            timestamp: data.timestamp,
            type: 'beer',
            name: name,
            kcal: kcal, 
            style: data.isCustom ? 'Custom' : data.style,
            size: data.isCustom ? data.ml : data.size,
            count: data.isCustom ? 1 : data.count,
            abv: abv,
            brewery: data.brewery,
            brand: data.brand,
            rating: data.rating,
            memo: data.memo,
            // カスタム情報
            isCustom: data.isCustom,
            customType: data.isCustom ? data.type : null,
            rawAmount: data.isCustom ? data.ml : null
        };
        
        let shareAction = null;

        if (id) {
            // 更新処理
            await db.logs.update(parseInt(id), logData);
            showMessage('<i class="ph-bold ph-pencil-simple"></i> 記録を更新しました', 'success');
        } else {
            // 新規登録（リピート経由もここを通る）
            await db.logs.add(logData);

            // ★修正: メッセージを一時保存する変数を用意
            let extraMessage = '';

            // 休肝日自動解除などの副作用をここに集約
            const ts = dayjs(data.timestamp);
            const existingCheck = await db.checks.where('timestamp').between(ts.startOf('day').valueOf(), ts.endOf('day').valueOf(), true, true).first();
            
            if (existingCheck && existingCheck.isDryDay) {
                await db.checks.update(existingCheck.id, { isDryDay: false });
                
                // ★修正: ここで showMessage せず、追記用メッセージを作成する
                // （改行して少し小さく表示すると見やすいです）
                extraMessage = '<br><span class="text-xs font-bold opacity-80">※休肝日設定を解除しました</span>';
            }

            // シェア文言の生成
            const { logs: currentLogs } = await Service.getAllDataForUI();
            const balance = Calc.calculateBalance(currentLogs);
            const shareText = Calc.generateShareText(logData, balance);
            const shareAction = { type: 'share', text: shareText, shareMode: 'image', imageType: 'beer', imageData: logData };

            const kcalMsg = Math.abs(kcal) > 500 ? `${Math.round(Math.abs(kcal))}kcalの借金です` : '記録しました！';
            
            // ★修正: ここで結合して表示
            showMessage(`<i class="ph-fill ph-beer-bottle text-lg"></i> ${kcalMsg}${extraMessage}`, 'success', shareAction);

            // Untappd連携（手動登録時のみ）
            if (data.useUntappd && data.brewery && data.brand) {
                const query = encodeURIComponent(`${data.brewery} ${data.brand}`);
                window.open(`https://untappd.com/search?q=${query}`, '_blank');
            }
        }
        
        await Service.recalcImpactedHistory(data.timestamp);
        document.dispatchEvent(new CustomEvent('refresh-ui'));
    },

    saveExerciseLog: async (exerciseKey, minutes, dateVal, applyBonus, id = null) => {
        const profile = Store.getProfile();
        const mets = EXERCISE[exerciseKey] ? EXERCISE[exerciseKey].mets : 3.0;
        
        // 1. 基礎燃焼カロリー
        const baseBurnKcal = Calc.calculateExerciseBurn(mets, minutes, profile);
        let finalKcal = baseBurnKcal;
        let memo = '';

        let ts;
        if (typeof dateVal === 'number') {
            // 数値で渡された場合（リピート機能など）は、その時刻をそのまま使う
            ts = dateVal;
        } else {
            // 文字列などで渡された場合（手動入力のカレンダーなど）は、昼12時に固定する
            ts = dayjs(dateVal).startOf('day').add(12, 'hour').valueOf();
        }
        
        // 2. ストリークボーナスの適用有無
        if (applyBonus) {
            // その時点でのStreakを取得して計算
            const logs = await db.logs.toArray();
            const checks = await db.checks.toArray();
            const streak = Calc.getCurrentStreak(logs, checks, profile, dayjs(ts));
            
            const creditInfo = Calc.calculateExerciseCredit(baseBurnKcal, streak);
            finalKcal = creditInfo.kcal;
            
            if (creditInfo.bonusMultiplier > 1.0) {
                memo = `Streak Bonus x${creditInfo.bonusMultiplier.toFixed(1)}`;
            }
        }

        const label = EXERCISE[exerciseKey] ? EXERCISE[exerciseKey].label : '運動';

        const logData = {
            timestamp: ts,
            type: 'exercise',
            name: label,
            kcal: finalKcal,
            minutes: minutes,
            exerciseKey: exerciseKey,
            rawMinutes: minutes,
            memo: memo
        };
        
        if (id) {
            await db.logs.update(parseInt(id), logData);
            showMessage('<i class="ph-bold ph-pencil-simple"></i> 記録を更新しました', 'success');
        } else {
            await db.logs.add(logData);

            // 運動でも「現在の正確な収支」を計算してシェア文言を出す
            const { logs: allLogs } = await Service.getAllDataForUI();
            const currentBalance = allLogs.reduce((sum, l) => sum + (l.kcal || 0), 0);
            const shareText = Calc.generateShareText(logData, currentBalance);
            const shareAction = { type: 'share', text: shareText };
            
            showMessage(`<i class="ph-fill ph-sneaker-move text-lg"></i> 記録しました！`, 'success', shareAction);
        }

        await Service.recalcImpactedHistory(ts);
        document.dispatchEvent(new CustomEvent('refresh-ui'));
    },

    deleteLog: async (id) => {
        try {
            const log = await db.logs.get(parseInt(id));
            const ts = log ? log.timestamp : Date.now();
            
            await db.logs.delete(parseInt(id));
            showMessage('削除しました', 'success');
            
            await Service.recalcImpactedHistory(ts);
            document.dispatchEvent(new CustomEvent('refresh-ui'));
        } catch (e) {
            console.error(e);
            showMessage('削除に失敗しました', 'error');     
        }
    },

    bulkDeleteLogs: async (ids) => { 
        try {
            // 再計算のために最も古い日付を取得
            let oldestTs = Date.now();
            for (const id of ids) {
                const log = await db.logs.get(id);
                if (log && log.timestamp < oldestTs) oldestTs = log.timestamp;
            }

            await db.logs.bulkDelete(ids);
            showMessage(`${ids.length}件削除しました`, 'success');
            await Service.recalcImpactedHistory(oldestTs);
            document.dispatchEvent(new CustomEvent('refresh-ui'));
        } catch (e) {
            console.error(e);
            showMessage('一括削除に失敗しました', 'error');
        }
    },

    saveDailyCheck: async (formData) => {
    // 1. 日付の正規化（その日の正午を基準にする）
    const targetDay = dayjs(formData.date);
    const ts = targetDay.startOf('day').add(12, 'hour').valueOf();
    const start = targetDay.startOf('day').valueOf();
    const end = targetDay.endOf('day').valueOf();
    
    // 2. その日の既存チェックを「すべて」取得する（重複データ対策）
    const existingRecords = await db.checks
        .where('timestamp')
        .between(start, end, true, true)
        .toArray();

    // 3. 保存データの構築
    const data = {
        timestamp: ts,
        isDryDay: formData.isDryDay,
        weight: formData.weight,
        isSaved: true // ★ユーザーが明示的に保存したことを示すフラグ
    };

    // カスタム項目（waistEaseなど）をすべてマージ
    Object.keys(formData).forEach(key => {
        if (key !== 'date') data[key] = formData[key];
    });

    if (existingRecords.length > 0) {
        // --- 更新（Update） & 重複削除（Clean） ---
        
        // 最初の1件を代表レコードとして更新
        const primaryId = existingRecords[0].id;
        await db.checks.update(primaryId, data);

        // ★重複（2件目以降）がある場合はすべて削除してDBを正常化する
        if (existingRecords.length > 1) {
            const redundantIds = existingRecords.slice(1).map(r => r.id);
            await db.checks.bulkDelete(redundantIds);
            console.log(`Cleaned up ${redundantIds.length} duplicate check records for ${formData.date}`);
        }

        showMessage('✅ デイリーチェックを更新しました', 'success');
        
    } else {
        // --- 新規登録（Add） ---
        await db.checks.add(data);
        
        // 休肝日ならシェアボタンを出す
        let shareAction = null;
        if (formData.isDryDay) {
            const shareText = Calc.generateShareText({ type: 'check', isDryDay: true });
            shareAction = { type: 'share', text: shareText };
        }
        
        showMessage('✅ デイリーチェックを記録しました', 'success', shareAction);  
    }
    
    // 体重を設定に反映
    if (formData.weight) {
        localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, formData.weight);
    }

    // 4. 履歴の再計算とUI更新（ご提示いただいた必須の2行）
    await Service.recalcImpactedHistory(ts);
    document.dispatchEvent(new CustomEvent('refresh-ui'));
},

saveManualExercise: async () => {
        // 1. 新しい隠しフィールドから選択値を取得
        const hiddenSelect = document.getElementById('exercise-select-value');
        const exerciseKey = hiddenSelect ? hiddenSelect.value : null;
        
        // 2. その他の入力値を取得
        const minutesInput = document.getElementById('manual-minutes');
        const minutes = minutesInput ? parseInt(minutesInput.value) : 0;
        
        const dateInput = document.getElementById('manual-date');
        const dateVal = dateInput ? dateInput.value : getVirtualDate();
        
        const bonusCheck = document.getElementById('manual-apply-bonus');
        const applyBonus = bonusCheck ? bonusCheck.checked : true;
        
        const idField = document.getElementById('editing-exercise-id');
        const existingId = (idField && idField.value) ? parseInt(idField.value) : null;

        // 3. バリデーション
        if (!exerciseKey) {
            showMessage('運動を選択してください', 'error');
            return;
        }
        if (!minutes || minutes <= 0) {
            showMessage('時間を正しく入力してください', 'error');
            return;
        }

        // 4. 既存の保存ロジックへ委譲
        await Service.saveExerciseLog(exerciseKey, minutes, dateVal, applyBonus, existingId);
        
        // 5. モーダルを閉じる
        if (window.UI && window.UI.closeModal) {
            window.UI.closeModal('exercise-modal');
        }
    }

};

