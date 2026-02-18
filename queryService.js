// @ts-check
import { db, Store } from './store.js';
import { LogService } from './logService.js';
import { Calc, getVirtualDate } from './logic.js';
import { APP } from './constants.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/**
 * チェックデータの重複を排除し、保存済みデータを優先する内部ヘルパー
 */
const _deduplicateChecks = (rawChecks) => {
    return Object.values(rawChecks.reduce((acc, cur) => {
        const dateStr = dayjs(cur.timestamp).format('YYYY-MM-DD');
        if (!acc[dateStr] || (!acc[dateStr].isSaved && cur.isSaved)) {
            acc[dateStr] = cur;
        }
        return acc;
    }, {}));
};

/**
 * QueryService: 読み取り専用のデータ取得操作
 * DBやストアからデータを取得・集約するが、書き込みは行わない。
 */
export const QueryService = {
    /**
     * 指定日のログ一覧を取得する（新しい順）
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
     */
    getLogById: async (id) => {
        return await LogService.getById(parseInt(id));
    },

    /**
     * アプリ全体のデータスナップショットを取得
     */
    getAppDataSnapshot: async () => {
        const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || 'weekly';
        const startStr = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START);
        const start = startStr ? parseInt(startStr) : 0;

        const currentLogs = await LogService.getAll();
        const rawChecks = await db.checks.toArray();
        const checks = _deduplicateChecks(rawChecks);

        const universalLogs = currentLogs;

        let targetLogs = universalLogs;
        if (mode !== 'permanent') {
            targetLogs = universalLogs.filter(l => l.timestamp >= start);
        }

        const balance = targetLogs.reduce((sum, l) => sum + (l.kcal || 0), 0);

        Store.setCachedData(currentLogs, checks, targetLogs);

        return {
            logs: targetLogs,
            allLogs: universalLogs,
            checks: checks,
            balance: balance,
            mode: mode
        };
    },

    getAllDataForUI: async () => {
        const { logs, checks, allLogs } = await QueryService.getAppDataSnapshot();
        return { logs, checks, allLogs };
    },

    /**
     * 指定した日付のチェック記録と飲酒状況を取得する
     */
    getCheckStatusForDate: async (dateVal) => {
        const d = dayjs(dateVal);
        const virtualDate = getVirtualDate(d.valueOf());
        const v = dayjs(virtualDate);
        const start = v.startOf('day').valueOf();
        const end = v.endOf('day').valueOf();

        const snapshot = await QueryService.getAppDataSnapshot();

        const check = snapshot.checks.find(c =>
            c.timestamp >= start && c.timestamp <= end
        ) || null;

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

    /**
     * 今日のチェックレコードを確保する（なければ空で作成）
     */
    ensureTodayCheckRecord: async () => {
        const todayStr = getVirtualDate();
        const vDate = dayjs(todayStr);
        const startOfDay = vDate.startOf('day').valueOf();
        const endOfDay = vDate.endOf('day').valueOf();

        try {
            const existing = await db.checks.where('timestamp').between(startOfDay, endOfDay).first();
            if (!existing) {
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
            console.error('[QueryService] Failed to ensure today check record:', e);
        }
    },

    /**
     * よく飲むビールを取得（ランキング集計）
     */
    getFrequentBeers: async (limit = 3) => {
        const logs = await LogService.getByType('beer');
        const stats = Calc.getBeerStats(logs);
        const rankedBeers = stats.beerStats || [];
        return rankedBeers.slice(0, limit);
    },

    /**
     * 直近のビールログを取得（ID降順で重複排除）
     */
    getRecentBeers: async (limit = 2) => {
        const logs = await LogService.getLatestByInsertOrder(100);

        const uniqueMap = new Map();
        const recents = [];

        for (const log of logs) {
            if (log.type !== 'beer') continue;
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
     * よくやる運動を取得（頻度順）
     */
    getFrequentExercises: async (limit = 5) => {
        const logs = await LogService.getByTypeRecent('exercise', 100);

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

        return Object.values(stats)
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return b.lastSeen - a.lastSeen;
            })
            .map(item => item.data)
            .slice(0, limit);
    },

    /**
     * 直近の運動ログを取得（ID降順で重複排除）
     */
    getRecentExercises: async (limit = 2) => {
        const logs = await LogService.getLatestByInsertOrder(100);

        const uniqueMap = new Map();
        const recents = [];

        for (const log of logs) {
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
};
