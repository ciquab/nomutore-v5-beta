// @ts-check
import { db } from './store.js';
import { LogService } from './logService.js';
import { APP } from './constants.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// ヘルパー: 月曜始まりの週頭を取得
const getStartOfWeek = (date = undefined) => {
    const d = dayjs(date);
    const day = d.day() || 7; // Sun(0)を7に変換 (Mon=1 ... Sun=7)
    return d.subtract(day - 1, 'day').startOf('day');
};

/**
 * PeriodService: 期間管理・アーカイブ操作
 * 期間モードの切替、ロールオーバー判定、アーカイブ作成を担当する。
 */
export const PeriodService = {
    calculatePeriodStart: (mode) => {
        const now = dayjs();
        if (mode === 'weekly') {
            return getStartOfWeek(now).valueOf();
        } else if (mode === 'monthly') {
            return now.startOf('month').valueOf();
        } else if (mode === 'custom') {
            return now.startOf('day').valueOf();
        }
        return 0;
    },

    /**
     * 期間設定の更新とデータ移行（復元）の実行
     */
    updatePeriodSettings: async (newMode, customData = {}) => {
        localStorage.setItem(APP.STORAGE_KEYS.PERIOD_MODE, newMode);

        let restoredCount = 0;

        if (newMode === 'custom') {
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
            const start = PeriodService.calculatePeriodStart(newMode);
            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, start);
        }

        return {
            mode: newMode,
            restoredCount: restoredCount
        };
    },

    /**
     * 期間のロールオーバーチェック
     */
    checkPeriodRollover: async () => {
        const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || APP.DEFAULTS.PERIOD_MODE;

        if (mode === 'permanent') return false;

        const storedStart = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START));

        if (!storedStart) {
            const newStart = PeriodService.calculatePeriodStart(mode);
            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, newStart);
            return false;
        }

        const now = dayjs();

        if (mode === 'weekly') {
            const currentWeekStart = getStartOfWeek(now);
            const startDate = dayjs(storedStart);
            if (!currentWeekStart.isSame(startDate, 'day')) {
                let weekStart = dayjs(storedStart);
                while (weekStart.isBefore(currentWeekStart, 'day')) {
                    const nextWeekStart = weekStart.add(7, 'day');
                    await PeriodService.archiveAndReset(weekStart.valueOf(), nextWeekStart.valueOf(), mode);
                    weekStart = nextWeekStart;
                }
                return true;
            }
        } else if (mode === 'monthly') {
            const currentMonthStart = now.startOf('month');
            const startDate = dayjs(storedStart);
            if (!currentMonthStart.isSame(startDate, 'day')) {
                let monthStart = dayjs(storedStart);
                while (monthStart.isBefore(currentMonthStart, 'day')) {
                    const nextMonthStart = monthStart.add(1, 'month').startOf('month');
                    await PeriodService.archiveAndReset(monthStart.valueOf(), nextMonthStart.valueOf(), mode);
                    monthStart = nextMonthStart;
                }
                return true;
            }
        } else if (mode === 'custom') {
            const endDateTs = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE));
            if (endDateTs && now.isAfter(dayjs(endDateTs).endOf('day'))) {
                return true;
            }
        }

        return false;
    },

    /**
     * アーカイブ作成と期間リセット
     */
    archiveAndReset: async (currentStart, nextStart, mode) => {
        return db.transaction('rw', db.logs, db.period_archives, async () => {
            const logsToArchive = await LogService.getByTimestampRangeAsc(currentStart, nextStart - 1);

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
                console.warn('[PeriodService] Archive for this period already exists. Skipping creation.');
            }

            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, nextStart);
        });
    },

    /**
     * 期間を延長する
     */
    extendPeriod: async (days = 7) => {
        const currentEndTs = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE)) || dayjs().endOf('day').valueOf();

        const newEnd = dayjs(currentEndTs).add(days, 'day').endOf('day').valueOf();

        localStorage.setItem(APP.STORAGE_KEYS.PERIOD_END_DATE, newEnd);
        localStorage.setItem(APP.STORAGE_KEYS.PERIOD_MODE, 'custom');

        console.log(`[PeriodService] Extended to ${dayjs(newEnd).format('YYYY-MM-DD')} and switched to custom mode.`);
    },
};
