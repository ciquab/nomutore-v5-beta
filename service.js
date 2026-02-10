// @ts-check
import { db, Store } from './store.js';
import { LogService } from './logService.js';
import { Calc, getVirtualDate } from './logic.js';
import { APP, EXERCISE, STYLE_SPECS } from './constants.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// ヘルパー: 月曜始まりの週頭を取得
const getStartOfWeek = (date = undefined) => {
    const d = dayjs(date);
    const day = d.day() || 7; // Sun(0)を7に変換 (Mon=1 ... Sun=7)
    return d.subtract(day - 1, 'day').startOf('day');
};

/**
 * チェックデータの重複を排除し、保存済みデータを優先する内部ヘルパー
 */
const _deduplicateChecks = (rawChecks) => {
    return Object.values(rawChecks.reduce((acc, cur) => {
        const dateStr = dayjs(cur.timestamp).format('YYYY-MM-DD');
        // まだデータがない、または「既存が未保存」で「今回が保存済み」なら採用
        if (!acc[dateStr] || (!acc[dateStr].isSaved && cur.isSaved)) {
            acc[dateStr] = cur;
        }
        return acc;
    }, {}));
};

export const Service = {
    // ★追加: 非同期処理を直列化するためのプロミスチェーン
    _recalcQueue: Promise.resolve(),

    /**
     * 指定日のログ一覧を取得する（新しい順）
     * @param {number} start
     * @param {number} end
     * @returns {Promise<import('./types.js').Log[]>}
     */
    getLogsByTimestampRange: async (start, end) => {
        return await LogService.getByTimestampRange(start, end);
    },

    /**
     * アーカイブ一覧を新しい順で取得する
     */
    getArchives: async () => {
        return await db.period_archives.reverse().toArray();
    },

    /**
     * IDでログを1件取得する
     * @param {number} id
     */
    getLogById: async (id) => {
        return await LogService.getById(parseInt(id));
    },

    /**
     * 全データを削除して初期化する
     */
    resetAllData: async () => {
        if (db.logs) await LogService.clear();
        if (db.checks) await db.checks.clear();
        if (db.period_archives) await db.period_archives.clear();
        localStorage.clear();
    },

    // getAllDataForUI を getAppDataSnapshot にリネームして強化
    getAppDataSnapshot: async () => {
        // --- A. 設定の取得 ---
        const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || 'weekly';
        const startStr = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START);
        const start = startStr ? parseInt(startStr) : 0;

        // --- B. 生データの収集 ---
        // 1. Current Logs: 現在の仕様では、これが「全期間の編集可能なログ」の正本です。
        // ※ LogServiceをimportしていない場合はファイルの先頭に追加してください
        const currentLogs = await LogService.getAll();
        
        // 2. Checks: 体調記録
        const rawChecks = await db.checks.toArray();
        const checks = _deduplicateChecks(rawChecks);

        // --- C. データの統合 ---
        
        // NOTE: 将来的に「アーカイブ後に db.logs からデータを消す」仕様に変更する場合は、
        // ここで archives を読み込み、currentLogs とマージする処理が必要になります。
        // 現在は db.logs に全て残る仕様のため、currentLogs をそのまま正とします。
        const universalLogs = currentLogs;

        // --- D. フィルタリングと計算 ---

        // 3. Target Logs: リスト表示・収支計算の対象
        // 基本は全データ（universalLogs）ですが、期間設定があればフィルタします。
        let targetLogs = universalLogs;
        
        if (mode !== 'permanent') {
            // 現在の仕様では、期間設定に関わらず universalLogs（全件）を持っているので、
            // ここでフィルタすることで「今週分」などを抽出します。
            targetLogs = universalLogs.filter(l => l.timestamp >= start);
        }
        
        // 4. Balance Calculation
        const balance = targetLogs.reduce((sum, l) => sum + (l.kcal || 0), 0);
        
        // 5. Cache Update
        Store.setCachedData(currentLogs, checks, targetLogs);


        // --- E. 結果の返却 ---
        return { 
            logs: targetLogs,       // 「期間内のデータ」（主にBalance計算の根拠として保持/デバッグ用）
            allLogs: universalLogs, // weekly.js/chart.js等で利用（全期間）
            checks: checks,
            balance: balance,
            mode: mode 
        };
    },

    getAllDataForUI: async () => {
        const { logs, checks, allLogs } = await Service.getAppDataSnapshot();
        return { logs, checks, allLogs };
    },

    /**
     * 指定した日付のチェック記録と飲酒状況を取得する
     * @param {string|number} dateVal - 日付文字列(YYYY-MM-DD) または タイムスタンプ
     * @returns {Promise<{ check: import('./types.js').Check | null, hasBeer: boolean }>}
     */
    getCheckStatusForDate: async (dateVal) => {
        const d = dayjs(dateVal);
        const start = d.startOf('day').valueOf();
        const end = d.endOf('day').valueOf();

        // Snapshotから最新データを取得
        // NOTE: getAppDataSnapshot は内部でキャッシュ(Store)と連携しており、
        // 頻繁に呼んでもDB負荷がかからない設計になっている前提。
        const snapshot = await Service.getAppDataSnapshot();

        // 1. その日のCheckを取得
        const check = snapshot.checks.find(c => 
            c.timestamp >= start && c.timestamp <= end
        ) || null;

        // 2. その日のビールログがあるか確認
        // NOTE: hasBeer判定は「全期間ログ(allLogs)」から行う。
        // 期間設定(Weekly等)でフィルタされた logs を使うと、範囲外の日付で判定ミスが起きるため。
        const hasBeer = snapshot.allLogs.some(l => 
            l.timestamp >= start && l.timestamp <= end && l.type === 'beer'
        );

        return { check, hasBeer };
    },

    getLogsWithPagination: async (offset, limit) => {
        const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || 'weekly';
        let logs, totalCount;

        if (mode === 'permanent') {
            totalCount = await LogService.count();
            logs = await LogService.getRecent(limit, offset);
        } else {
            const periodStart = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START)) || 0;
            totalCount = await LogService.countFrom(periodStart);
            logs = await LogService.getRecentFrom(periodStart, limit, offset);
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
 * 履歴の再計算（最終安定版）
 */
recalcImpactedHistory: async (changedTimestamp) => {
    Service._recalcQueue = Service._recalcQueue.then(async () => {
            try {
                return db.transaction('rw', db.logs, db.checks, db.period_archives, async () => {
                    const allLogs = await LogService.getAll();
                    const allChecks = await db.checks.toArray();
                    const profile = Store.getProfile();

                    const logMap = new Map();
                    const checkMap = new Map();
                    let minTs = Number.MAX_SAFE_INTEGER;
                    let found = false;

        // --- 1. Map作成（仮想日付ベース） ---
        allLogs.forEach(l => {
            if (l.timestamp < minTs) minTs = l.timestamp;
            found = true;
            const d = getVirtualDate(l.timestamp);
            if (!logMap.has(d)) logMap.set(d, { hasBeer: false, hasExercise: false, balance: 0 });
            
            const entry = logMap.get(d);
            if (l.type === 'beer') entry.hasBeer = true;
            if (l.type === 'exercise') entry.hasExercise = true;
            
            // 既存の計算済みkcalを一旦セット（ここを起点に差分を計算する）
            entry.balance += (l.kcal || 0);
        });

        allChecks.forEach(c => {
            if (c.timestamp < minTs) minTs = c.timestamp;
            found = true;
            const d = getVirtualDate(c.timestamp);
            checkMap.set(d, c.isDryDay);
        });

        const firstDate = found ? dayjs(minTs).startOf('day') : dayjs();

        const exerciseLogsByDate = new Map();
        allLogs.forEach(l => {
            if (l.type === 'exercise') {
                const dStr = getVirtualDate(l.timestamp);
                if (!exerciseLogsByDate.has(dStr)) exerciseLogsByDate.set(dStr, []);
                exerciseLogsByDate.get(dStr).push(l);
            }
        });

        // --- 2. 遡及再計算ループ ---
        const virtualStartDateStr = getVirtualDate(changedTimestamp);
        let currentDate = dayjs(virtualStartDateStr).startOf('day');
        const today = dayjs().endOf('day');

        let updateCount = 0;
        let safeGuard = 0;

        while (currentDate.isBefore(today) || currentDate.isSame(today, 'day')) {
            if (safeGuard++ > 3650) break;

            const dateStr = currentDate.format('YYYY-MM-DD');
            
            // 重要：Calc.getStreakFromMap は「最終安定版」を使用
            const streak = Calc.getStreakFromMap(logMap, checkMap, firstDate, currentDate);
            
            const daysExerciseLogs = exerciseLogsByDate.get(dateStr) || [];
            
            for (const log of daysExerciseLogs) {
                // デフォルト値を 6.0 (またはマスター定義) に統一
                const mets = EXERCISE[log.exerciseKey]?.mets || 6.0;
                
                // 元の運動時間 (rawMinutes) があればそれを使用、なければ minutes を使用
                const targetMins = log.rawMinutes || log.minutes || 0;
                const baseBurn = Calc.calculateExerciseBurn(mets, targetMins, profile);
                const updatedCredit = Calc.calculateExerciseCredit(baseBurn, streak);
                
                let newMemo = (log.memo || '').replace(/Streak Bonus x[0-9.]+/g, '').trim();
                if (updatedCredit.bonusMultiplier > 1.0) {
                    const bonusTag = `Streak Bonus x${updatedCredit.bonusMultiplier.toFixed(1)}`;
                    newMemo = newMemo ? `${newMemo} ${bonusTag}` : bonusTag;
                }

                if (Math.abs((log.kcal || 0) - updatedCredit.kcal) > 0.1 || log.memo !== newMemo) {
                    const oldKcal = log.kcal || 0;
                    
                    // DB更新
                    await LogService.update(log.id, {
                        kcal: updatedCredit.kcal,
                        memo: newMemo
                    });
                    
                    // Map上の残高も更新（連鎖判定用）
                    const entry = logMap.get(dateStr);
                    if (entry) {
                        entry.balance += (updatedCredit.kcal - oldKcal);
                    }
                    
                    // メモリ上のログオブジェクトも更新（後のアーカイブ計算用）
                    log.kcal = updatedCredit.kcal;
                    log.memo = newMemo;
                    
                    updateCount++;
                }
            }
            currentDate = currentDate.add(1, 'day');
        }

        // --- 3. アーカイブの同期 ---
        const affectedArchives = await db.period_archives.where('endDate').aboveOrEqual(changedTimestamp).toArray();
        for (const archive of affectedArchives) {
            const periodLogs = await LogService.getByTimestampRangeAsc(archive.startDate, archive.endDate);
            const totalBalance = periodLogs.reduce((sum, log) => sum + (log.kcal || 0), 0);
            
            await db.period_archives.update(archive.id, {
                totalBalance: totalBalance,
                logs: periodLogs,
                updatedAt: Date.now()
            });
        }
                    
    });
    } catch (e) {
                console.error('[Service] Recalc impact error:', e);
            }
        });

        // キューの完了を待機して結果を返す
        return Service._recalcQueue;            
},

    /**
    * 期間設定の更新とデータ移行（復元）の実行
    * @param {string} newMode - 'weekly' | 'monthly' | 'permanent' | 'custom'
    * @param {Object} customData - { startDate, endDate, label } (Customモード時のみ)
    * @returns {Promise<Object|null>} 処理結果
    */
    updatePeriodSettings: async (newMode, customData = {}) => {
        const currentMode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE);
    
        // モード変更の保存
        localStorage.setItem(APP.STORAGE_KEYS.PERIOD_MODE, newMode);

        let restoredCount = 0;

        if (newMode === 'custom') {
            // --- Customモードのロジックを集約 ---
            if (customData.startDate) {
                localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, dayjs(customData.startDate).startOf('day').valueOf());
            }
            if (customData.endDate) {
                localStorage.setItem(APP.STORAGE_KEYS.PERIOD_END_DATE, dayjs(customData.endDate).endOf('day').valueOf());
            }
            if (customData.label) {
                localStorage.setItem(APP.STORAGE_KEYS.CUSTOM_LABEL, customData.label || 'Project');
            }
        } else if (newMode === 'permanent') {
            // --- Permanentモード（過去ログ復元） ---
            const archives = await db.period_archives.toArray();
            if (archives.length > 0) {
                for (const arch of archives) {
                    if (arch.logs && arch.logs.length > 0) {
                        const logsToRestore = arch.logs.map(({id, ...rest}) => rest);
                        await LogService.bulkAdd(logsToRestore);
                        restoredCount += logsToRestore.length;
                    }
                }
                await db.period_archives.clear();
                localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, 0); 
            }
        } else {
            // --- 通常モード (Weekly/Monthly) ---
            const start = Service.calculatePeriodStart(newMode);
            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, start);
        }

        return {
            mode: newMode,
            restoredCount: restoredCount
        };
    },

    /**
     * プロフィール情報の保存
     * @param {Object} data - { weight, height, age, gender }
     */
    updateProfile: async (data) => {
        const keys = APP.STORAGE_KEYS;
        if (data.weight) localStorage.setItem(keys.WEIGHT, data.weight);
        if (data.height) localStorage.setItem(keys.HEIGHT, data.height);
        if (data.age)    localStorage.setItem(keys.AGE, data.age);
        if (data.gender) localStorage.setItem(keys.GENDER, data.gender);
        return { success: true };
    },

    /**
     * アプリケーション基本設定の保存
     * @param {Object} data - { mode1, mode2, baseExercise, defaultRecordExercise, theme }
     */
    updateAppSettings: async (data) => {
        const keys = APP.STORAGE_KEYS;
        if (data.mode1) localStorage.setItem(keys.MODE1, data.mode1);
        if (data.mode2) localStorage.setItem(keys.MODE2, data.mode2);
        if (data.baseExercise) localStorage.setItem(keys.BASE_EXERCISE, data.baseExercise);
        if (data.defaultRecordExercise) localStorage.setItem(keys.DEFAULT_RECORD_EXERCISE, data.defaultRecordExercise);
        if (data.theme) localStorage.setItem(keys.THEME, data.theme);
        return { success: true };
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
            const logsToArchive = await LogService.getBefore(nextStart);
            
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
 * 期間を延長する
 * @param {number} days 延長日数
 */
extendPeriod: async (days = 7) => {
    // 現在の終了日を取得（なければ今日を起点）
    const currentEndTs = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE)) || dayjs().endOf('day').valueOf();
    
    const newEnd = dayjs(currentEndTs).add(days, 'day').endOf('day').valueOf();
    
    localStorage.setItem(APP.STORAGE_KEYS.PERIOD_END_DATE, newEnd);
    localStorage.setItem(APP.STORAGE_KEYS.PERIOD_MODE, 'custom');
    
    console.log(`[Service] Extended to ${dayjs(newEnd).format('YYYY-MM-DD')} and switched to custom mode.`);
},

    /**
     * ★追加: よく飲むビールを取得（ランキング集計）
     * Recordタブで使用 (Frequency)
     */
    getFrequentBeers: async (limit = 3) => {
        const logs = await LogService.getByType('beer');
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
        const logs = await LogService.getLatestByInsertOrder(100);
        
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
        const logs = await LogService.getByTypeRecent('exercise', 100);

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
        const logs = await LogService.getLatestByInsertOrder(100);
        
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
            return await Service.saveBeerLog({
                ...log,
                timestamp: Date.now(),
                isCustom: log.isCustom || false,
                useUntappd: false 
            }, null);
        } else {
            return await Service.saveExerciseLog(
                log.exerciseKey,
                log.minutes,
                Date.now(), // 仮想日付ではなく、現在の正確な時刻を刻む
                true, 
                null
            );
        }
    },

    // --- 以下、シェア機能追加のために修正されたメソッド ---

   saveBeerLog: async (data, id = null) => {
    let name, kcal, abv, carb;
    // ★追加: 戻り値で使う変数をあらかじめ初期化しておく
    let dryDayCanceled = false;
    let untappdUrl = null;

    // beerForm で確定済みの値をそのまま信頼する
    const count = data.count ?? 1; 
    abv = data.abv;
    const ml = data.ml;
    carb = data.carb ?? (data.isCustom ? (data.type === 'dry' ? 0.0 : 3.0) : (STYLE_SPECS[data.style]?.carb ?? 3.0));
    kcal = Calc.calculateBeerDebit(ml, abv, carb, count);

    name = data.isCustom
        ? (data.type === 'dry' ? '蒸留酒 (糖質ゼロ)' : '醸造酒/カクテル')
        : `${data.style}${count !== 1 ? ` x${count}` : ''}`;

    const logData = {
        timestamp: data.timestamp,
        type: 'beer',
        name: name,
        kcal: kcal, 
        style: data.isCustom ? 'Custom' : data.style,
        size: data.isCustom ? null : data.size, // UI用
        rawAmount: ml,   
        count,
        abv: abv,
        brewery: data.brewery,
        brand: data.brand,
        rating: data.rating,
        memo: data.memo,
        isCustom: data.isCustom,
        customType: data.isCustom ? data.type : null
    };

        // --- ログ保存（新規 or 更新） ---
            if (id) {
                await LogService.update(parseInt(id), logData);
            } else {
               await LogService.add(logData);
            }

        // --- Untappd導線の生成（保存後に実行） ---
            if (data.useUntappd && data.brewery && data.brand) {
            const query = encodeURIComponent(`${data.brewery} ${data.brand}`);
            untappdUrl = `https://untappd.com/search?q=${query}`;
            }

        // --- ★ここを修正：仮想日付（Virtual Date）に基づいてチェックを探す ---
    const vDateStr = getVirtualDate(data.timestamp); // 深夜4時までなら前日の日付を取得
    const vDay = dayjs(vDateStr);
    const start = vDay.startOf('day').valueOf();
    const end = vDay.endOf('day').valueOf();
    
    // 物理的な timestamp ではなく、その「仮想日」の範囲で検索
    const existingChecks = await db.checks.where('timestamp').between(start, end, true, true).toArray();

    if (existingChecks.length > 0) {
        // 最も重要な1件（既存レコード）を「休肝日なし」に更新
        const primaryCheck = existingChecks[0];
        if (primaryCheck.isDryDay) {
            await db.checks.update(primaryCheck.id, { isDryDay: false });
            dryDayCanceled = true;
        }

        // JSONで見られた「重複レコード」があれば、このタイミングで削除して掃除する
        if (existingChecks.length > 1) {
            const redundantIds = existingChecks.slice(1).map(c => c.id);
            await db.checks.bulkDelete(redundantIds);
            console.log(`[Service] Cleaned up ${redundantIds.length} redundant checks for consistency.`);
        }
    }

    // 3. スナップショットから最新バランスを取得してシェア文言作成
    const { balance } = await Service.getAppDataSnapshot();
    const shareText = Calc.generateShareText(logData, balance);
    const shareAction = { 
        type: 'share', 
        text: shareText, 
        shareMode: 'image', 
        imageType: 'beer', 
        imageData: logData 
    };

    // 4. 履歴再計算（これでストリークも最新ログを反映して計算されます）
    await Service.recalcImpactedHistory(data.timestamp);

    return {
        success: true,
        isUpdate: !!id,
        kcal: kcal,
        dryDayCanceled: dryDayCanceled,
        shareAction: shareAction,
        untappdUrl: untappdUrl
    };
},

    saveExerciseLog: async (exerciseKey, minutes, dateVal, applyBonus, id = null) => {
    const profile = Store.getProfile();
    const mets = EXERCISE[exerciseKey] ? EXERCISE[exerciseKey].mets : 3.0;
    
    // 1. 基礎燃焼カロリー計算
    const baseBurnKcal = Calc.calculateExerciseBurn(mets, minutes, profile);
    let finalKcal = baseBurnKcal;
    let memo = '';
    let bonusMultiplier = 1.0;

    let ts;
    if (typeof dateVal === 'number') {
        ts = dateVal;
    } else {
        ts = dayjs(dateVal).startOf('day').add(12, 'hour').valueOf();
    }
    
    // 2. ストリークボーナスの計算
    if (applyBonus) {
        const logs = await LogService.getAll();
        const checks = await db.checks.toArray();
        const streak = Calc.getCurrentStreak(logs, checks, profile, dayjs(ts));
        
        const creditInfo = Calc.calculateExerciseCredit(baseBurnKcal, streak);
        finalKcal = creditInfo.kcal;
        bonusMultiplier = creditInfo.bonusMultiplier;
        
        if (bonusMultiplier > 1.0) {
            memo = `Streak Bonus x${bonusMultiplier.toFixed(1)}`;
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
    
    let shareAction = null;

    if (id) {
        // 更新
        await LogService.update(parseInt(id), logData);
    } else {
        // 新規登録
        await LogService.add(logData);

        // シェア文言の生成
        const { balance } = await Service.getAppDataSnapshot();
        const shareText = Calc.generateShareText(logData, balance);
        shareAction = { type: 'share', text: shareText };
    }

    // データの整合性維持（これはServiceの仕事）
    await Service.recalcImpactedHistory(ts);

    // ★重要: UI層への「報告書」を返却
    return {
        success: true,
        isUpdate: !!id,
        kcal: finalKcal,
        bonusMultiplier: bonusMultiplier,
        shareAction: shareAction
    };
},

/**
 * ログを1件削除する
 * @returns {Promise<{success: boolean, timestamp: number}>}
 */
deleteLog: async (id) => {
    const logId = parseInt(id);
    const log = await LogService.getById(logId);
    if (!log) throw new Error('削除対象のログが見つかりませんでした');

    const ts = log.timestamp;
    await LogService.delete(logId);

    // 履歴の再計算（データ整合性の維持はServiceの責務）
    await Service.recalcImpactedHistory(ts);

    // 削除したデータの情報を返却する
    return { success: true, timestamp: ts };
},

/**
 * ログをまとめて削除する
 * @param {Array<number>} ids
 * @returns {Promise<{success: boolean, count: number, oldestTs: number}>}
 */
bulkDeleteLogs: async (ids) => {
    if (!ids || ids.length === 0) return { success: false, count: 0 };

    // 再計算のために最も古い日付を取得
    let oldestTs = Date.now();
    for (const id of ids) {
        const log = await LogService.getById(id);
        if (log && log.timestamp < oldestTs) oldestTs = log.timestamp;
    }

    await LogService.bulkDelete(ids);
    
    // 履歴の再計算
    await Service.recalcImpactedHistory(oldestTs);

    return { 
        success: true, 
        count: ids.length, 
        oldestTs: oldestTs 
    };
},

    /**
 * デイリーチェックの保存
 * @param {Object} formData
 * @returns {Promise<Object>} 処理結果報告
 */
saveDailyCheck: async (formData) => {
    // 1. 日付の正規化
    const targetDay = dayjs(formData.date);
    const ts = targetDay.startOf('day').add(12, 'hour').valueOf();
    const start = targetDay.startOf('day').valueOf();
    const end = targetDay.endOf('day').valueOf();
    
    // 2. 既存レコードの確認（重複対策ロジックはServiceの責務として維持）
    const existingRecords = await db.checks
        .where('timestamp')
        .between(start, end, true, true)
        .toArray();

    // 3. 保存データの構築
    const data = {
        timestamp: ts,
        isDryDay: formData.isDryDay,
        weight: formData.weight,
        isSaved: true
    };

    // カスタム項目をマージ
    Object.keys(formData).forEach(key => {
        if (key !== 'date') data[key] = formData[key];
    });

    const isUpdate = existingRecords.length > 0;

    if (isUpdate) {
        // 更新 & 重複削除
        const primaryId = existingRecords[0].id;
        await db.checks.update(primaryId, data);

        if (existingRecords.length > 1) {
            const redundantIds = existingRecords.slice(1).map(r => r.id);
            await db.checks.bulkDelete(redundantIds);
            console.log(`[Service] Cleaned up ${redundantIds.length} duplicate records.`);
        }
    } else {
        // 新規登録
        await db.checks.add(data);
    }
    
    // 体重をプロフィール設定に反映（データの同期もServiceの責務）
    if (formData.weight) {
        localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, formData.weight);
    }

    // 4. 履歴の再計算
    await Service.recalcImpactedHistory(ts);

    // 5. UI側での演出に必要なアクションを構築
    let shareAction = null;
    if (formData.isDryDay) {
        const shareText = Calc.generateShareText({ type: 'check', isDryDay: true });
        shareAction = { type: 'share', text: shareText };
    }

    // 「報告書」を返す
    return {
        success: true,
        isUpdate: isUpdate,
        isDryDay: formData.isDryDay,
        shareAction: shareAction
    };
},
};






