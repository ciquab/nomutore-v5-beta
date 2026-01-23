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
        
        // Permanentモードなら、無条件で全データを返す
        if (mode === 'permanent') {
            const logs = await db.logs.toArray();
            const checks = await db.checks.toArray();
            return { logs, checks };
        }

        // それ以外（Weekly/Monthly/Custom）は、現在の期間（PERIOD_START以降）のみ返す
        const startStr = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START);
        const start = startStr ? parseInt(startStr) : 0;

        const logs = await db.logs.where('timestamp').aboveOrEqual(start).toArray();
        const checks = await db.checks.toArray(); // Checksは全期間取得（Streak計算等のため）
        
        return { logs, checks };
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
     * 【修正版】履歴変更に伴う影響（Streakボーナス、アーカイブ残高など）を再計算する
     * $O(N^2)$ 問題を解消した最適化バージョン
     * @param {number} changedTimestamp - 変更があったログの日時
     */
    recalcImpactedHistory: async (changedTimestamp) => {
        // 1. 全データを取得（計算用）
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
        // ----------------------------------------

        // 2. 変更日以降のすべての日付について再計算
        const startDate = dayjs(changedTimestamp).startOf('day');
        const today = dayjs().endOf('day');
        
        let currentDate = startDate;
        let updateCount = 0;
        let safeGuard = 0;

        while (currentDate.isBefore(today) || currentDate.isSame(today, 'day')) {
            if (safeGuard++ > 365) break; // 無限ループ防止

            const dayStart = currentDate.startOf('day').valueOf();
            const dayEnd = currentDate.endOf('day').valueOf();

            // その時点でのStreak (Optimized call)
            const streak = Calc.getStreakFromMap(logMap, checkMap, firstDate, currentDate);
            
            // ボーナス倍率
            const creditInfo = Calc.calculateExerciseCredit(100, streak); // 100はダミー
            const bonusMultiplier = creditInfo.bonusMultiplier;

            // その日の運動ログを探して更新
            const daysExerciseLogs = allLogs.filter(l => l.type === 'exercise' && l.timestamp >= dayStart && l.timestamp <= dayEnd);
            
            for (const log of daysExerciseLogs) {
                const mets = EXERCISE[log.exerciseKey] ? EXERCISE[log.exerciseKey].mets : 3.0;
                const baseBurn = Calc.calculateExerciseBurn(mets, log.minutes, profile);
                const updatedCredit = Calc.calculateExerciseCredit(baseBurn, streak);
                
                // メモ欄の更新（"Streak Bonus x1.2" のような文字列を置換）
                let newMemo = log.memo || '';
                // 既存のボーナスタグを消す
                newMemo = newMemo.replace(/Streak Bonus x[0-9.]+/g, '').trim();
                
                if (bonusMultiplier > 1.0) {
                    const bonusTag = `Streak Bonus x${bonusMultiplier.toFixed(1)}`;
                    newMemo = newMemo ? `${newMemo} ${bonusTag}` : bonusTag;
                }

                // 値が変わる場合のみDB更新
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
        // 変更された日付を含む、またはそれ以降のアーカイブの totalBalance を更新する
        try {
            const affectedArchives = await db.period_archives.where('endDate').aboveOrEqual(changedTimestamp).toArray();
            
            for (const archive of affectedArchives) {
                // アーカイブ期間内のログを再取得して合計
                // (startDateが変更日より後のアーカイブも、Streak変化で運動カロリーが変わっている可能性があるため再計算)
                if (archive.startDate <= changedTimestamp) {
                    // 変更日がアーカイブ期間内、あるいはそれ以前の場合
                    const periodLogs = await db.logs.where('timestamp').between(archive.startDate, archive.endDate, true, true).toArray();
                    const totalBalance = periodLogs.reduce((sum, log) => sum + (log.kcal || 0), 0);
                    
                    await db.period_archives.update(archive.id, {
                        totalBalance: totalBalance,
                        updatedAt: Date.now()
                    });
                }
            }
        } catch (e) {
            console.error('[Service] Failed to update archives:', e);
        }
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
            // カスタム期間は「現在」を起点にするか、「前回のリセット日」を維持するか...
            // シンプルに「今日から」にする
            return now.startOf('day').valueOf();
        }
        return 0;
    },

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

        const startDate = dayjs(storedStart);
        const now = dayjs();
        let shouldRollover = false;
        let nextStart = null;

        if (mode === 'weekly') {
            const currentWeekStart = getStartOfWeek(now);
            // 保存されている開始週と、現在の週頭が違うならリセット
            if (!currentWeekStart.isSame(startDate, 'day')) {
                shouldRollover = true;
                nextStart = currentWeekStart.valueOf();
            }
        } else if (mode === 'monthly') {
            const currentMonthStart = now.startOf('month');
            if (!currentMonthStart.isSame(startDate, 'day')) {
                shouldRollover = true;
                nextStart = currentMonthStart.valueOf();
            }
        } else if (mode === 'custom') {
            const duration = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_DURATION)) || 14;
            const limitDate = startDate.add(duration, 'day');
            if (now.isAfter(limitDate) || now.isSame(limitDate)) {
                shouldRollover = true;
                nextStart = limitDate.valueOf(); // 次の期間は「期限切れ日」からスタート（あるいは今日から？）
                // 連続性を保つなら limitDate だが、アプリを使ってない期間があるとズレる。
                // ここではシンプルに limitDate (予定されていた次の開始日) にする
            }
        }

        if (shouldRollover) {
            // アーカイブ処理
            await db.transaction('rw', db.logs, db.period_archives, async () => {
                // 次の期間開始前までのログを取得
                const logsToArchive = await db.logs.where('timestamp').below(nextStart).toArray();
                
                if (logsToArchive.length > 0) {
                    const totalBalance = logsToArchive.reduce((sum, l) => sum + (l.kcal || 0), 0);
                    
                    // アーカイブテーブルに追加
                    await db.period_archives.add({
                        startDate: storedStart,
                        endDate: nextStart - 1,
                        mode: mode,
                        totalBalance: totalBalance,
                        logs: logsToArchive, // ログ本体もJSONとして保存しておく
                        createdAt: Date.now()
                    });

                    // メインテーブルから削除
                    const idsToDelete = logsToArchive.map(l => l.id);
                    await db.logs.bulkDelete(idsToDelete);
                }

                // 新しい開始日を設定
                localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, nextStart);
            });
            return true;
        }

        return false;
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
            showMessage('📝 記録を更新しました', 'success');
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
                    showMessage('🍺 飲酒記録のため、休肝日を解除しました', 'info');
                } else {
                    console.warn('[Safety] Skipping dry day removal due to timestamp mismatch.');
                }
            }

            // ★シェア文言の生成
            const shareText = Calc.generateShareText(logData, -500); // balanceは仮の値、または非同期で取得して渡す
            shareAction = { type: 'share', text: shareText };

            if (Math.abs(kcal) > 500) {
                showMessage(`🍺 記録完了！ ${Math.round(Math.abs(kcal))}kcalの借金です😱`, 'error', shareAction);
                Feedback.beer();
                // ★追加: 飲みすぎでも乾杯！
                showToastAnimation(); 
            } else {
                showMessage('🍺 記録しました！', 'success', shareAction);
                Feedback.beer();
                // ★追加: 飲みすぎでも乾杯！
                showToastAnimation(); 
            }
            
            // Untappd連携
            if (data.useUntappd && data.brewery && data.brand) {
                const query = encodeURIComponent(`${data.brewery} ${data.brand}`);
                window.open(`https://untappd.com/search?q=${query}`, '_blank');
            }
        }
        
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
            showMessage('📝 運動記録を更新しました', 'success');
        } else {
            await db.logs.add(logData);
            // ★シェア文言生成
            const shareText = Calc.generateShareText(logData, 100); 
            const shareAction = { type: 'share', text: shareText };
            
            showMessage(`🏃‍♀️ ${Math.round(minutes)}分の運動を記録しました！`, 'success', shareAction);
            showConfetti();
            Feedback.success();

        }

        await Service.recalcImpactedHistory(ts);
        document.dispatchEvent(new CustomEvent('refresh-ui'));
    },

    deleteLog: async (id) => {
        if (!confirm('この記録を削除しますか？')) return;
        
        try {
            const log = await db.logs.get(parseInt(id));
            const ts = log ? log.timestamp : Date.now();
            
            await db.logs.delete(parseInt(id));
            showMessage('削除しました', 'success');
            Feedback.delete();
            
            await Service.recalcImpactedHistory(ts);
            document.dispatchEvent(new CustomEvent('refresh-ui'));
        } catch (e) {
            console.error(e);
            showMessage('削除に失敗しました', 'error');
            Feedback.error();
        }
    },

    bulkDeleteLogs: async (ids) => {
        if (!confirm(`${ids.length}件のデータを削除しますか？`)) return;
        
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
            Feedback.error();
        }
    },

    saveDailyCheck: async (formData) => {
        const ts = dayjs(formData.date).startOf('day').add(12, 'hour').valueOf();
        
        // 既存チェックを探す
        const existing = await db.checks.where('timestamp')
            .between(dayjs(ts).startOf('day').valueOf(), dayjs(ts).endOf('day').valueOf())
            .first();

        // 基本データ
        const data = {
            timestamp: ts,
            isDryDay: formData.isDryDay,
            weight: formData.weight
        };

        // カスタム項目を含むすべての項目をマージ
        Object.keys(formData).forEach(key => {
            if (key !== 'date') data[key] = formData[key];
        });

        if (existing) {
            await db.checks.update(existing.id, data);
            showMessage('✅ デイリーチェックを更新しました', 'success');
            Feedback.check(); 
        } else {
            await db.checks.add(data);
            
            // ★休肝日ならシェアボタンを出す
            let shareAction = null;
            if (formData.isDryDay) {
                const shareText = Calc.generateShareText({ type: 'check', isDryDay: true });
                shareAction = { type: 'share', text: shareText };
            }
            
            showMessage('✅ デイリーチェックを記録しました', 'success', shareAction);
            showConfetti();
            Feedback.check();
        }
        
        if (formData.weight) {
            localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, formData.weight);
        }

        await Service.recalcImpactedHistory(ts);
        document.dispatchEvent(new CustomEvent('refresh-ui'));
    }
};