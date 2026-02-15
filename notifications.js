// @ts-check
import { APP, EXERCISE } from './constants.js';
import { Calc, getVirtualDate } from './logic.js';
import { Store, db } from './store.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

const KEYS = APP.STORAGE_KEYS;

/** @type {number|null} */
let _dailyTimerId = null;
/** @type {number|null} */
let _periodEveTimerId = null;

/**
 * 通知マネージャー
 * PWAローカル通知のスケジューリングと表示を管理する
 */
export const NotificationManager = {

    /**
     * 初期化: 権限確認とスケジューリング開始
     */
    init: () => {
        if (!('Notification' in window)) {
            console.log('[Notif] Notification API not supported');
            return;
        }

        NotificationManager.scheduleAll();

        // visibilitychange時に再スケジュール（日付跨ぎ対応）
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                NotificationManager.scheduleAll();
            }
        });
    },

    /**
     * 全通知のスケジュールを設定/リセットする
     */
    scheduleAll: () => {
        NotificationManager.scheduleDailyReminder();
        NotificationManager.schedulePeriodEve();
    },

    /**
     * 通知権限をリクエスト
     * @returns {Promise<boolean>} 許可されたか
     */
    requestPermission: async () => {
        if (!('Notification' in window)) return false;

        if (Notification.permission === 'granted') return true;
        if (Notification.permission === 'denied') return false;

        const result = await Notification.requestPermission();
        return result === 'granted';
    },

    /**
     * 現在の通知設定を取得する
     */
    getSettings: () => ({
        dailyEnabled: localStorage.getItem(KEYS.NOTIF_DAILY_ENABLED) === 'true',
        dailyTime: localStorage.getItem(KEYS.NOTIF_DAILY_TIME) || '21:00',
        periodEveEnabled: localStorage.getItem(KEYS.NOTIF_PERIOD_EVE_ENABLED) === 'true',
        periodEveTime: localStorage.getItem(KEYS.NOTIF_PERIOD_EVE_TIME) || '20:00',
    }),

    /**
     * 通知設定を保存する
     * @param {Object} settings
     */
    saveSettings: (settings) => {
        if (settings.dailyEnabled !== undefined) {
            localStorage.setItem(KEYS.NOTIF_DAILY_ENABLED, String(settings.dailyEnabled));
        }
        if (settings.dailyTime !== undefined) {
            localStorage.setItem(KEYS.NOTIF_DAILY_TIME, settings.dailyTime);
        }
        if (settings.periodEveEnabled !== undefined) {
            localStorage.setItem(KEYS.NOTIF_PERIOD_EVE_ENABLED, String(settings.periodEveEnabled));
        }
        if (settings.periodEveTime !== undefined) {
            localStorage.setItem(KEYS.NOTIF_PERIOD_EVE_TIME, settings.periodEveTime);
        }
    },

    // ─────────────────────────────────────────────
    // デイリーリマインダー（チェック + ログ促進）
    // ─────────────────────────────────────────────

    /**
     * デイリーリマインダーをスケジュールする
     */
    scheduleDailyReminder: () => {
        if (_dailyTimerId !== null) {
            clearTimeout(_dailyTimerId);
            _dailyTimerId = null;
        }

        const settings = NotificationManager.getSettings();
        if (!settings.dailyEnabled) return;
        if (Notification.permission !== 'granted') return;

        const msUntil = _getMsUntilTime(settings.dailyTime);
        if (msUntil === null) return; // 今日の通知は既に過去

        // 今日既に表示済みか確認
        const lastShown = localStorage.getItem(KEYS.NOTIF_DAILY_LAST_SHOWN);
        const today = dayjs().format('YYYY-MM-DD');
        if (lastShown === today) return;

        _dailyTimerId = setTimeout(async () => {
            _dailyTimerId = null;
            await NotificationManager.showDailyReminder();
        }, msUntil);

        console.log(`[Notif] Daily reminder scheduled in ${Math.round(msUntil / 60000)}min`);
    },

    /**
     * デイリーリマインダーを表示する
     */
    showDailyReminder: async () => {
        if (Notification.permission !== 'granted') return;

        const today = dayjs().format('YYYY-MM-DD');
        const lastShown = localStorage.getItem(KEYS.NOTIF_DAILY_LAST_SHOWN);
        if (lastShown === today) return;

        // 今日のデータ状態を確認
        const virtualDate = getVirtualDate();

        let hasLog = false;
        let hasCheck = false;

        try {
            const allLogs = await db.logs.toArray();
            hasLog = allLogs.some(l => {
                const logDate = getVirtualDate(l.timestamp);
                return logDate === virtualDate;
            });

            const allChecks = await db.checks.toArray();
            hasCheck = allChecks.some(c => {
                const checkDate = dayjs(c.timestamp).format('YYYY-MM-DD');
                return checkDate === virtualDate && c.isSaved;
            });
        } catch (e) {
            console.error('[Notif] Data check error:', e);
        }

        // 両方記録済みなら通知不要
        if (hasLog && hasCheck) {
            localStorage.setItem(KEYS.NOTIF_DAILY_LAST_SHOWN, today);
            return;
        }

        // メッセージ構築
        let body = '';
        if (!hasLog && !hasCheck) {
            body = '今日の記録がまだです。休肝日ですか？コンディションチェックもお忘れなく。';
        } else if (!hasCheck) {
            body = '今日のコンディションチェックがまだです。体調を記録しましょう。';
        } else {
            body = '今日の飲食・運動を記録しましょう。休肝日なら休肝マークをつけましょう。';
        }

        _showNotification('NOMUTORE リマインダー', {
            body,
            tag: 'nomutore-daily',
            icon: './icon-192_2.png',
        });

        localStorage.setItem(KEYS.NOTIF_DAILY_LAST_SHOWN, today);
    },

    // ─────────────────────────────────────────────
    // 期間リセット前日の借金サマリー
    // ─────────────────────────────────────────────

    /**
     * 期間リセット前日通知をスケジュールする
     */
    schedulePeriodEve: () => {
        if (_periodEveTimerId !== null) {
            clearTimeout(_periodEveTimerId);
            _periodEveTimerId = null;
        }

        const settings = NotificationManager.getSettings();
        if (!settings.periodEveEnabled) return;
        if (Notification.permission !== 'granted') return;

        // リセット前日かどうか判定
        if (!_isTomorrowPeriodReset()) return;

        const msUntil = _getMsUntilTime(settings.periodEveTime);
        if (msUntil === null) return;

        // 今日既に表示済みか確認
        const lastShown = localStorage.getItem(KEYS.NOTIF_PERIOD_EVE_LAST_SHOWN);
        const today = dayjs().format('YYYY-MM-DD');
        if (lastShown === today) return;

        _periodEveTimerId = setTimeout(async () => {
            _periodEveTimerId = null;
            await NotificationManager.showPeriodEveReminder();
        }, msUntil);

        console.log(`[Notif] Period eve reminder scheduled in ${Math.round(msUntil / 60000)}min`);
    },

    /**
     * 期間リセット前日の借金サマリー通知を表示する
     */
    showPeriodEveReminder: async () => {
        if (Notification.permission !== 'granted') return;

        const today = dayjs().format('YYYY-MM-DD');
        const lastShown = localStorage.getItem(KEYS.NOTIF_PERIOD_EVE_LAST_SHOWN);
        if (lastShown === today) return;

        if (!_isTomorrowPeriodReset()) return;

        // 現在のバランスを計算
        let balance = 0;
        try {
            const mode = localStorage.getItem(KEYS.PERIOD_MODE) || 'weekly';
            const startStr = localStorage.getItem(KEYS.PERIOD_START);
            const start = startStr ? parseInt(startStr) : 0;

            const allLogs = await db.logs.toArray();
            const targetLogs = mode !== 'permanent'
                ? allLogs.filter(l => l.timestamp >= start)
                : allLogs;

            balance = targetLogs.reduce((sum, l) => sum + (l.kcal || 0), 0);
        } catch (e) {
            console.error('[Notif] Balance calc error:', e);
        }

        // メッセージ構築
        const mode = localStorage.getItem(KEYS.PERIOD_MODE) || 'weekly';
        const modeLabel = mode === 'weekly' ? '今週' : mode === 'monthly' ? '今月' : '今期間';
        let body = '';

        if (balance >= 0) {
            // 借金なし
            body = `明日リセットです。${modeLabel}の収支はプラスです！素晴らしい。`;
        } else {
            // 借金あり → 運動時間を計算
            const debt = Math.abs(balance);
            const profile = Store.getProfile();
            const baseExKey = Store.getBaseExercise();
            const minutes = Calc.convertKcalToMinutes(debt, baseExKey, profile);
            const exData = EXERCISE[baseExKey] || EXERCISE['walking'];

            body = `明日リセット。現在の借金: ${Math.round(debt)}kcal。${exData.label}${minutes}分で完済できます。`;
        }

        _showNotification('NOMUTORE 期間サマリー', {
            body,
            tag: 'nomutore-period-eve',
            icon: './icon-192_2.png',
        });

        localStorage.setItem(KEYS.NOTIF_PERIOD_EVE_LAST_SHOWN, today);
    },
};

// ─────────────────────────────────────────────
// 内部ヘルパー
// ─────────────────────────────────────────────

/**
 * 指定時刻(HH:mm)までのミリ秒を返す。既に過ぎていたら null
 * @param {string} timeStr "HH:mm"
 * @returns {number|null}
 */
function _getMsUntilTime(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const now = dayjs();
    const target = now.startOf('day').add(h, 'hour').add(m, 'minute');
    const diff = target.diff(now);
    return diff > 0 ? diff : null;
}

/**
 * 明日が期間リセット日かどうかを判定する
 * @returns {boolean}
 */
function _isTomorrowPeriodReset() {
    const mode = localStorage.getItem(KEYS.PERIOD_MODE) || 'weekly';

    if (mode === 'permanent') return false;

    const tomorrow = dayjs().add(1, 'day');

    if (mode === 'weekly') {
        // 月曜リセット → 日曜日が前日
        return tomorrow.day() === 1; // 1 = Monday
    }
    if (mode === 'monthly') {
        // 1日リセット → 月末が前日
        return tomorrow.date() === 1;
    }
    if (mode === 'custom') {
        const endDateTs = parseInt(localStorage.getItem(KEYS.PERIOD_END_DATE) || '0');
        if (!endDateTs) return false;
        const endDate = dayjs(endDateTs);
        // 終了日の翌日がリセット日 → 終了日当日が前日
        return tomorrow.isAfter(endDate.endOf('day'));
    }

    return false;
}

/**
 * 通知を表示する（SW経由 or Notification API直接）
 * @param {string} title
 * @param {NotificationOptions} options
 */
function _showNotification(title, options) {
    try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            // SW経由で表示（バックグラウンドでも確実に表示）
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, options);
            });
        } else {
            // フォールバック: Notification API直接
            new Notification(title, options);
        }
    } catch (e) {
        console.error('[Notif] Show notification error:', e);
    }
}
