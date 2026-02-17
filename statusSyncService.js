// @ts-check
import { db } from './store.js';
import { LogService } from './logService.js';
import { NotificationManager } from './notifications.js';
import { getVirtualDate } from './logic.js';

export const StatusSyncService = {
    _syncQueue: Promise.resolve(),

    /**
     * 最新の収支・記録日をサーバーへ同期する（直列化）
     * @param {number} balance
     * @returns {Promise<void>}
     */
    syncLatestStatus: async (balance) => {
        StatusSyncService._syncQueue = StatusSyncService._syncQueue
            .catch(() => {})
            .then(async () => {
                try {
                    const latestLogs = await LogService.getRecent(1);
                    const lastLogDate = latestLogs.length > 0
                        ? getVirtualDate(latestLogs[0].timestamp)
                        : null;

                    const latestCheck = await db.checks.orderBy('timestamp').reverse().first();
                    const lastCheckDate = latestCheck
                        ? getVirtualDate(latestCheck.timestamp)
                        : null;

                    await NotificationManager.updateServerStatus({
                        balance,
                        lastCheckDate,
                        lastLogDate
                    });
                } catch (e) {
                    console.warn('[StatusSyncService] Sync status warning:', e);
                }
            });

        return StatusSyncService._syncQueue;
    }
};
