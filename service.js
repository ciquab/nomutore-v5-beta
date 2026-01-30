import { db, Store } from './store.js';
import { Calc } from './logic.js';
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
        const todayStr = dayjs().format('YYYY-MM-DD');
        const startOfDay = dayjs().startOf('day').valueOf();
        const endOfDay = dayjs().endOf('day').valueOf();

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
                const d = dayjs(l.timestamp).format('YYYY-MM-DD');
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

            allChecks.forEach(c => {
                if (c.timestamp < minTs) minTs = c.timestamp;
                found = true;
                const d = dayjs(c.timestamp).format('YYYY-MM-DD');
                checkMap.set(d, c.isDryDay);
            });

            const firstDate = found ? dayjs(minTs).startOf('day') : dayjs();

            // ▼▼▼ 追加: 運動ログを日付で高速検索するためのMapを作成 (Performance Fix) ▼▼▼
            const exerciseLogsByDate = new Map();
            allLogs.forEach(l => {
                if (l.type === 'exercise') {
                    const dStr = dayjs(l.timestamp).format('YYYY-MM-DD');
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
        let shouldRollover = false;
        let nextStart = null;

        // --- A. Weekly / Monthly (自動更新) ---
        if (mode === 'weekly') {
            const currentWeekStart = getStartOfWeek(now);
            const startDate = dayjs(storedStart);
            if (!currentWeekStart.isSame(startDate, 'day')) {
                // 週が変わっている -> 自動アーカイブ実行
                nextStart = currentWeekStart.valueOf();
                await Service.archiveAndReset(storedStart, nextStart, mode);
                return true; // モーダル（完了報告）を表示
            }
        } else if (mode === 'monthly') {
            const currentMonthStart = now.startOf('month');
            const startDate = dayjs(storedStart);
            if (!currentMonthStart.isSame(startDate, 'day')) {
                // 月が変わっている -> 自動アーカイブ実行
                nextStart = currentMonthStart.valueOf();
                await Service.archiveAndReset(storedStart, nextStart, mode);
                return true;
            }
        } 
        // --- B. Custom (手動更新待機) ---
        else if (mode === 'custom') {
            // Durationではなく「終了日(PERIOD_END_DATE)」を見るように変更
            const endDateTs = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE));
            
            // 終了日が設定されており、かつ今日がその日を過ぎている場合
            if (endDateTs && now.isAfter(dayjs(endDateTs).endOf('day'))) {
                // ★ここではアーカイブを実行しない！
                // 「期間終了」という事実だけをUIに伝え、ユーザーに選択させる
                
                // モーダルの文言書き換え用のDOM操作（Service層でやるべきではないが、簡易実装として許容）
                const label = localStorage.getItem(APP.STORAGE_KEYS.CUSTOM_LABEL) || 'Project';
                const titleEl = document.getElementById('rollover-title');
                const descEl = document.getElementById('rollover-desc');
                
                if(titleEl) titleEl.textContent = `${label} Completed!`;
                if(descEl) descEl.innerHTML = "期間が終了しました。<br>次のアクションを選択してください。";

                return true; // checkStatus.js で toggleModal('rollover-modal', true) される
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
     * RecordタブとAction Menuで使用
     */
    getFrequentBeers: async (limit = 3) => {
        // 1. 全ログを取得
        const logs = await db.logs.where('type').equals('beer').toArray();
        
        // 2. 既存の集計ロジックを利用してランキング化
        const stats = Calc.getBeerStats(logs);
        const rankedBeers = stats.beerStats || [];

        // 3. 上位N件を返す
        return rankedBeers.slice(0, limit);
    },

    /**
     * ★追加: 直近の運動ログを取得（重複除外）
     */
    getRecentExercises: async (limit = 5) => {
        const logs = await db.logs.where('type').equals('exercise').reverse().toArray();
        const uniqueMap = new Map();
        const recents = [];
        
        for (const log of logs) {
            // exerciseKeyがあるものを優先
            if (!log.exerciseKey) continue;
            
            // 種目と時間の組み合わせでユニーク化
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
     * ★追加: ログを複製して今日の日付で登録（リピート機能）
     * ストリークボーナス再計算付き
     */
    repeatLog: async (log) => {
        const now = dayjs();
        const profile = Store.getProfile(); 

        let newKcal = log.kcal;

        // 運動ならストリークボーナス再計算
        if (log.type === 'exercise' && log.exerciseKey && EXERCISE[log.exerciseKey]) {
            try {
                const allLogs = await db.logs.toArray();
                const allChecks = await db.checks.toArray();
                const currentStreak = Calc.getCurrentStreak(allLogs, allChecks, profile);
                const mets = EXERCISE[log.exerciseKey].mets;
                const baseBurn = Calc.calculateExerciseBurn(mets, log.minutes, profile);
                const credit = Calc.calculateExerciseCredit(baseBurn, currentStreak);
                newKcal = credit.kcal;
            } catch (e) {
                console.error('[Repeat] Recalculation failed', e);
            }
        }

        // ビールの場合、統計データには単体kcalが含まれていない場合があるので補完
        if (log.type === 'beer' && (!newKcal || newKcal === 0)) {
             const styleSpec = STYLE_SPECS[log.style] || STYLE_SPECS['Custom'];
             // 簡易計算: 平均的な度数とサイズから算出（本来は厳密な再計算が望ましいがUX優先）
             // ここでは既存ログの値があればそれを使い、なければデフォルト140kcalとする
             newKcal = -140; 
        }

        const newLog = {
            timestamp: now.valueOf(),
            type: log.type,
            name: log.name,
            brand: log.brand || log.name,
            brewery: log.brewery,
            kcal: newKcal,
            minutes: log.minutes,
            rawMinutes: log.rawMinutes,
            exerciseKey: log.exerciseKey,
            style: log.style,
            count: log.count || 1,
            size: log.size,
            memo: log.memo ? `(Repeat) ${log.memo}` : undefined,
            abv: log.abv,
            rawAmount: log.rawAmount
        };

        await db.logs.add(newLog);
        
        // 音を鳴らす (Feedbackオブジェクトを利用)
        if (typeof Feedback !== 'undefined') {
            if (newLog.type === 'beer') {
                // ビール: 専用の乾杯音があればそれを、なければ追加音を鳴らす
                if (Feedback.beer) Feedback.beer();
                else if (Feedback.success) Feedback.success();
            } else {
                // 運動: 追加音を鳴らす
                if (Feedback.success) Feedback.success();
            }
        }

        // 演出とメッセージ
        if (newLog.type === 'beer') {
            showConfetti();
            showMessage(`<i class="ph-fill ph-beer-bottle text-lg"></i> 記録しました: ${newLog.name}`, 'success');
        } else {
            const minStr = newLog.minutes ? `(${newLog.minutes}分)` : '';
            showMessage(`<i class="ph-fill ph-sneaker-move text-lg"></i> 記録しました: ${newLog.name} ${minStr}`, 'success');
        }
        
        // UI更新イベント発火
        document.dispatchEvent(new CustomEvent('refresh-ui'));
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
            await db.logs.update(parseInt(id), logData);
            // 更新時はシェアボタン出さない（煩わしいため）
            showMessage('<i class="ph-bold ph-pencil-simple"></i> 運動記録を更新しました', 'success');
        } else {
            await db.logs.add(logData);

            // ★修正: 休肝日チェック解除のロジックに安全弁を追加
            const ts = dayjs(data.timestamp);
            const start = ts.startOf('day').valueOf();
            const end = ts.endOf('day').valueOf();
            
            // 「記録した日」のチェックレコードを取得
            const existingCheck = await db.checks.where('timestamp').between(start, end, true, true).first();
            
            if (existingCheck && existingCheck.isDryDay) {
                // ここで念のため日付一致確認 (timestampがstart-endの範囲内か)
                // betweenでクエリしているので確実だが、論理的バグ防止のため
                if (existingCheck.timestamp >= start && existingCheck.timestamp <= end) {
                    await db.checks.update(existingCheck.id, { isDryDay: false });
                    showMessage('<i class="ph-fill ph-beer-bottle text-lg"></i> 飲酒記録のため、休肝日を解除しました', 'info');
                } else {
                    console.warn('[Safety] Skipping dry day removal due to timestamp mismatch.');
                }
            }

            // ★修正: シェアアクションの生成 (画像シェア対応)
            const { logs } = await Service.getAllDataForUI(); // 最新バランス取得用
            const balance = Calc.calculateBalance(logs); // 現在のバランス
            const shareText = Calc.generateShareText(logData, balance);
            
            const shareAction = { 
                type: 'share', 
                text: shareText, // テキストシェア用（フォールバック）
                shareMode: 'image', // 画像モード指定
                imageType: 'beer',  // ビールカード指定
                imageData: logData  // カード生成用データ
            };

            if (Math.abs(kcal) > 500) {
                showMessage(`<i class="ph-fill ph-beer-bottle text-lg"></i> 記録完了！ ${Math.round(Math.abs(kcal))}kcalの借金です`, 'error', shareAction); 
            } else {
                showMessage('<i class="ph-fill ph-beer-bottle text-lg"></i> 記録しました！', 'success', shareAction);   
            }
            
            // Untappd連携
            if (data.useUntappd && data.brewery && data.brand) {
                const query = encodeURIComponent(`${data.brewery} ${data.brand}`);
                window.open(`https://untappd.com/search?q=${query}`, '_blank');
            }
        }

        // 2. データ更新通知
        Store.setCachedData(await db.logs.toArray(), await db.checks.toArray()); // キャッシュ更新
        
        // 履歴影響再計算
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

        const ts = dayjs(dateVal).startOf('day').add(12, 'hour').valueOf();
        
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
            showMessage('<i class="ph-bold ph-pencil-simple"></i> 運動記録を更新しました', 'success');
        } else {
            await db.logs.add(logData);
            // ★シェア文言生成
            const shareText = Calc.generateShareText(logData, 100); 
            const shareAction = { type: 'share', text: shareText };
            
            showMessage(`<i class="ph-fill ph-sneaker-move text-lg"></i> ${Math.round(minutes)}分の運動を記録しました！`, 'success', shareAction);        
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
             Feedback.delete();
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
        const dateVal = dateInput ? dateInput.value : dayjs().format('YYYY-MM-DD');
        
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

