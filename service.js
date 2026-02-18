// @ts-check
import { db, Store } from './store.js';
import { LogService } from './logService.js';
import { Calc, getVirtualDate } from './logic.js';
import { APP, EXERCISE, STYLE_SPECS } from './constants.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';
import { StatusSyncService } from './statusSyncService.js';
import { QueryService } from './queryService.js';
import { PeriodService } from './periodService.js';

/**
 * 運動ログのkcal/memoを一元計算する
 */
const _calculateExerciseLogOutcome = (exerciseKey, minutes, profile, streak, baseMemo = '') => {
    const mets = EXERCISE[exerciseKey]?.mets || 6.0;
    const baseBurn = Calc.calculateExerciseBurn(mets, minutes, profile);
    const creditInfo = Calc.calculateExerciseCredit(baseBurn, streak);

    const kcal = Math.round(creditInfo.kcal * 10) / 10;

    const normalizedMemo = (baseMemo || '').replace(/Streak Bonus x[0-9.]+/g, '').trim();
    const bonusTag = creditInfo.bonusMultiplier > 1.0
        ? `Streak Bonus x${creditInfo.bonusMultiplier.toFixed(1)}`
        : '';
    const memo = bonusTag
        ? (normalizedMemo ? `${normalizedMemo} ${bonusTag}` : bonusTag)
        : normalizedMemo;

    return {
        kcal,
        memo,
        bonusMultiplier: creditInfo.bonusMultiplier
    };
};

/**
 * Service: アプリケーションのメインファサード
 *
 * 内部的に以下のサブサービスに委譲する:
 * - QueryService (queryService.js): 読み取り専用のデータ取得
 * - PeriodService (periodService.js): 期間管理・アーカイブ
 * - SaveService (このファイル): 保存・削除・再計算・同期
 */
export const Service = {
    // --- QueryService (読み取り) ---
    getLogsByTimestampRange: QueryService.getLogsByTimestampRange,
    getArchives: QueryService.getArchives,
    getLogById: QueryService.getLogById,
    getAppDataSnapshot: QueryService.getAppDataSnapshot,
    getAllDataForUI: QueryService.getAllDataForUI,
    getCheckStatusForDate: QueryService.getCheckStatusForDate,
    getLogsWithPagination: QueryService.getLogsWithPagination,
    ensureTodayCheckRecord: QueryService.ensureTodayCheckRecord,
    getFrequentBeers: QueryService.getFrequentBeers,
    getRecentBeers: QueryService.getRecentBeers,
    getFrequentExercises: QueryService.getFrequentExercises,
    getRecentExercises: QueryService.getRecentExercises,

    // --- PeriodService (期間管理) ---
    calculatePeriodStart: PeriodService.calculatePeriodStart,
    updatePeriodSettings: PeriodService.updatePeriodSettings,
    checkPeriodRollover: PeriodService.checkPeriodRollover,
    archiveAndReset: PeriodService.archiveAndReset,
    extendPeriod: PeriodService.extendPeriod,

    // --- SaveService (保存・削除・再計算) ---

    _recalcQueue: Promise.resolve(),

    /**
     * 保存パイプライン直列化キュー
     */
    _saveQueue: Promise.resolve(),
    _enqueueSave(fn) {
        Service._saveQueue = Service._saveQueue.catch(() => {}).then(fn);
        return Service._saveQueue;
    },

    /**
     * 履歴の再計算（最適化版）
     * 変更日以降の運動ログがある日のみストリーク再計算を行い、
     * 全日走査を回避する。O(D×S) → O(E×S) (E=運動日数)
     */
    recalcImpactedHistory: async (changedTimestamp) => {
        Service._recalcQueue = Service._recalcQueue.catch(() => {}).then(async () => {
            try {
                return db.transaction('rw', db.logs, db.checks, db.period_archives, async () => {
                    const allLogs = await LogService.getAll();
                    const allChecks = await db.checks.toArray();
                    const profile = Store.getProfile();

                    const logMap = new Map();
                    const checkMap = new Map();
                    let minTs = Number.MAX_SAFE_INTEGER;
                    let found = false;

                    const virtualStartDateStr = getVirtualDate(changedTimestamp);

                    // --- 1. Map作成 + 運動ログ抽出を1パスで実行 ---
                    const exerciseLogsByDate = new Map();

                    allLogs.forEach(l => {
                        if (l.timestamp < minTs) minTs = l.timestamp;
                        found = true;
                        const d = getVirtualDate(l.timestamp);
                        if (!logMap.has(d)) logMap.set(d, { hasBeer: false, hasExercise: false, balance: 0 });

                        const entry = logMap.get(d);
                        if (l.type === 'beer') entry.hasBeer = true;
                        if (l.type === 'exercise') {
                            entry.hasExercise = true;
                            if (d >= virtualStartDateStr) {
                                if (!exerciseLogsByDate.has(d)) exerciseLogsByDate.set(d, []);
                                exerciseLogsByDate.get(d).push(l);
                            }
                        }

                        entry.balance += (l.kcal || 0);
                    });

                    allChecks.forEach(c => {
                        if (c.timestamp < minTs) minTs = c.timestamp;
                        found = true;
                        const d = getVirtualDate(c.timestamp);
                        checkMap.set(d, c.isDryDay);
                    });

                    const firstDate = found ? dayjs(minTs).startOf('day') : dayjs();

                    // --- 2. 運動ログがある日のみ日付順に再計算 ---
                    const exerciseDates = [...exerciseLogsByDate.keys()].sort();

                    let updateCount = 0;

                    for (const dateStr of exerciseDates) {
                        const currentDate = dayjs(dateStr).startOf('day');
                        const streak = Calc.getStreakFromMap(logMap, checkMap, firstDate, currentDate);
                        const daysExerciseLogs = exerciseLogsByDate.get(dateStr);

                        for (const log of daysExerciseLogs) {
                            const targetMins = log.rawMinutes || log.minutes || 0;
                            const outcome = _calculateExerciseLogOutcome(log.exerciseKey, targetMins, profile, streak, log.memo || '');

                            if (Math.abs((log.kcal || 0) - outcome.kcal) > 0.1 || log.memo !== outcome.memo) {
                                const oldKcal = log.kcal || 0;

                                await LogService.update(log.id, {
                                    kcal: outcome.kcal,
                                    memo: outcome.memo
                                });

                                const entry = logMap.get(dateStr);
                                if (entry) {
                                    entry.balance += (outcome.kcal - oldKcal);
                                }

                                log.kcal = outcome.kcal;
                                log.memo = outcome.memo;

                                updateCount++;
                            }
                        }
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

        return Service._recalcQueue;
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

    /**
     * プロフィール情報の保存
     */
    updateProfile: async (data) => {
        const keys = APP.STORAGE_KEYS;
        if (data.weight != null) localStorage.setItem(keys.WEIGHT, data.weight);
        if (data.height != null) localStorage.setItem(keys.HEIGHT, data.height);
        if (data.age != null)    localStorage.setItem(keys.AGE, data.age);
        if (data.gender != null) localStorage.setItem(keys.GENDER, data.gender);
        return { success: true };
    },

    /**
     * アプリケーション基本設定の保存
     */
    updateAppSettings: async (data) => {
        const keys = APP.STORAGE_KEYS;
        if (data.mode1 != null) localStorage.setItem(keys.MODE1, data.mode1);
        if (data.mode2 != null) localStorage.setItem(keys.MODE2, data.mode2);
        if (data.baseExercise != null) localStorage.setItem(keys.BASE_EXERCISE, data.baseExercise);
        if (data.defaultRecordExercise != null) localStorage.setItem(keys.DEFAULT_RECORD_EXERCISE, data.defaultRecordExercise);
        if (data.theme != null) localStorage.setItem(keys.THEME, data.theme);
        return { success: true };
    },

    /**
     * ログを複製して今日の日付で登録（リピート機能）
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
                Date.now(),
                true,
                null
            );
        }
    },

    saveBeerLog: (data, id = null) => Service._enqueueSave(async () => {
        let name, kcal, abv, carb;
        let dryDayCanceled = false;
        let untappdSearchTerm = null;

        const count = data.count ?? 1;
        abv = data.abv;
        const ml = data.ml;
        carb = data.carb ?? (data.isCustom ? (data.type === 'dry' ? 0.0 : 3.0) : (STYLE_SPECS[data.style]?.carb ?? 3.0));
        const rawKcal = Calc.calculateBeerDebit(ml, abv, carb, count);
        kcal = Math.round(rawKcal * 10) / 10;

        name = data.isCustom
            ? (data.type === 'dry' ? '蒸留酒 (糖質ゼロ)' : '醸造酒/カクテル')
            : `${data.style}${count !== 1 ? ` x${count}` : ''}`;

        const logData = {
            timestamp: data.timestamp,
            type: 'beer',
            name: name,
            kcal: kcal,
            style: data.isCustom ? 'Custom' : data.style,
            size: data.isCustom ? null : data.size,
            rawAmount: ml,
            count,
            abv: abv,
            brewery: data.brewery,
            brand: data.brand,
            rating: data.rating,
            memo: data.memo,
            isCustom: data.isCustom,
            customType: data.isCustom ? data.type : null,
            flavorProfile: data.flavorProfile || null
        };

        if (id) {
            await LogService.update(parseInt(id), logData);
        } else {
            await LogService.add(logData);
        }

        if (data.useUntappd && data.brewery && data.brand) {
            untappdSearchTerm = `${data.brewery} ${data.brand}`;
        }

        const vDateStr = getVirtualDate(data.timestamp);
        const vDay = dayjs(vDateStr);
        const start = vDay.startOf('day').valueOf();
        const end = vDay.endOf('day').valueOf();

        const existingChecks = await db.checks.where('timestamp').between(start, end, true, true).toArray();

        if (existingChecks.length > 0) {
            const primaryCheck = existingChecks[0];
            if (primaryCheck.isDryDay) {
                await db.checks.update(primaryCheck.id, { isDryDay: false });
                dryDayCanceled = true;
            }

            if (existingChecks.length > 1) {
                const redundantIds = existingChecks.slice(1).map(c => c.id);
                await db.checks.bulkDelete(redundantIds);
            }
        }

        await Service.recalcImpactedHistory(data.timestamp);

        const { balance } = await QueryService.getAppDataSnapshot();
        await StatusSyncService.syncLatestStatus(balance);

        return {
            success: true,
            isUpdate: !!id,
            kcal: kcal,
            dryDayCanceled: dryDayCanceled,
            untappdSearchTerm: untappdSearchTerm,
            savedLog: logData
        };
    }),

    saveExerciseLog: (exerciseKey, minutes, dateVal, applyBonus, id = null) => Service._enqueueSave(async () => {
        const profile = Store.getProfile();
        let finalKcal = 0;
        let memo = '';
        let bonusMultiplier = 1.0;

        let ts;
        if (typeof dateVal === 'number') {
            ts = dateVal;
        } else {
            ts = dayjs(dateVal).startOf('day').add(12, 'hour').valueOf();
        }

        let streak = 0;
        if (applyBonus) {
            const logs = await LogService.getAll();
            const checks = await db.checks.toArray();
            streak = Calc.getCurrentStreak(logs, checks, profile, dayjs(ts));
        }

        const outcome = _calculateExerciseLogOutcome(exerciseKey, minutes, profile, streak);
        finalKcal = outcome.kcal;
        memo = outcome.memo;
        bonusMultiplier = outcome.bonusMultiplier;

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
            await LogService.update(parseInt(id), logData);
        } else {
            await LogService.add(logData);
        }

        await Service.recalcImpactedHistory(ts);

        const { balance } = await QueryService.getAppDataSnapshot();
        await StatusSyncService.syncLatestStatus(balance);

        return {
            success: true,
            isUpdate: !!id,
            kcal: finalKcal,
            bonusMultiplier: bonusMultiplier,
            savedLog: logData
        };
    }),

    deleteLog: (id) => Service._enqueueSave(async () => {
        const logId = parseInt(id);
        const log = await LogService.getById(logId);
        if (!log) throw new Error('削除対象のログが見つかりませんでした');

        const ts = log.timestamp;
        await LogService.delete(logId);

        await Service.recalcImpactedHistory(ts);
        const { balance } = await QueryService.getAppDataSnapshot();
        await StatusSyncService.syncLatestStatus(balance);

        return { success: true, timestamp: ts };
    }),

    bulkDeleteLogs: (ids) => Service._enqueueSave(async () => {
        if (!ids || ids.length === 0) return { success: false, count: 0 };

        let oldestTs = Date.now();
        for (const id of ids) {
            const log = await LogService.getById(id);
            if (log && log.timestamp < oldestTs) oldestTs = log.timestamp;
        }

        await LogService.bulkDelete(ids);

        await Service.recalcImpactedHistory(oldestTs);
        const { balance } = await QueryService.getAppDataSnapshot();
        await StatusSyncService.syncLatestStatus(balance);

        return {
            success: true,
            count: ids.length,
            oldestTs: oldestTs
        };
    }),

    saveDailyCheck: (formData) => Service._enqueueSave(async () => {
        const targetDay = dayjs(formData.date);
        const ts = targetDay.startOf('day').add(12, 'hour').valueOf();
        const start = targetDay.startOf('day').valueOf();
        const end = targetDay.endOf('day').valueOf();

        const existingRecords = await db.checks
            .where('timestamp')
            .between(start, end, true, true)
            .toArray();

        const data = {
            timestamp: ts,
            isDryDay: formData.isDryDay,
            weight: (formData.weight === '' || formData.weight === null || formData.weight === undefined)
                ? null
                : Number(formData.weight),
            isSaved: true
        };

        Object.keys(formData).forEach(key => {
            if (key !== 'date' && key !== 'weight') data[key] = formData[key];
        });

        const isUpdate = existingRecords.length > 0;

        if (isUpdate) {
            const primaryId = existingRecords[0].id;
            await db.checks.update(primaryId, data);

            if (existingRecords.length > 1) {
                const redundantIds = existingRecords.slice(1).map(r => r.id);
                await db.checks.bulkDelete(redundantIds);
            }
        } else {
            await db.checks.add(data);
        }

        if (formData.weight) {
            localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, formData.weight);
        }

        await Service.recalcImpactedHistory(ts);

        const { balance } = await QueryService.getAppDataSnapshot();
        await StatusSyncService.syncLatestStatus(balance);

        return {
            success: true,
            isUpdate: isUpdate,
            isDryDay: formData.isDryDay
        };
    }),
};
