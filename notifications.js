// @ts-check
import { APP } from './constants.js';

const KEYS = APP.STORAGE_KEYS;
const PUSH = APP.PUSH;

/**
 * 通知マネージャー (Client Side)
 * 役割:
 * 1. 通知権限のリクエスト
 * 2. 通知設定の保存
 * 3. サーバー(Firebase)への設定・データ同期
 * ※ ローカルでのタイマー監視(setTimeout)は廃止し、サーバー管理に移行しました。
 */
export const NotificationManager = {

    /**
     * 初期化: APIサポート確認のみ
     */
    init: () => {
        if (!('Notification' in window)) {
            console.log('[Notif] Notification API not supported');
        }
        // ローカルスケジューリングは不要になったため何もしない
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
        if (result === 'granted') {
            // 許可されたら即座にサーバーへ購読情報を送る
            await NotificationManager.syncPushSubscription();
        }
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
     * 通知設定を保存し、サーバーへ同期する
     * @param {Object} settings
     */
    saveSettings: async (settings) => {
        // LocalStorageへ保存
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

        // サーバーサイド Push の同期処理
        const s = NotificationManager.getSettings();
        const anyEnabled = s.dailyEnabled || s.periodEveEnabled;

        if (anyEnabled && Notification.permission === 'granted') {
            await NotificationManager.syncPushSubscription();
        } else if (!anyEnabled) {
            // 全てオフにされた場合は購読解除
            await NotificationManager.unsubscribePush();
        }
    },

    // ─────────────────────────────────────────────
    // サーバーサイド Push 購読管理 & データ同期
    // ─────────────────────────────────────────────

    /**
     * Push 購読を作成/更新して設定と共にサーバーに送信
     */
    syncPushSubscription: async () => {
        try {
            if (!('PushManager' in window)) {
                console.log('[Push] PushManager not supported');
                return;
            }

            const reg = await navigator.serviceWorker.ready;
            let subscription = await reg.pushManager.getSubscription();

            // 未購読なら新規作成
            if (!subscription) {
                const vapidKey = _urlBase64ToUint8Array(PUSH.VAPID_PUBLIC_KEY);
                subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: vapidKey,
                });
                console.log('[Push] New subscription created');
            }

            // 現在の期間設定を取得
            const periodMode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || 'weekly';
            const periodStart = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START) || '0');
            const periodEnd = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE) || '0');

            // サーバーに送信
            const settings = NotificationManager.getSettings();
            const res = await fetch(`${PUSH.API_BASE}/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: subscription.toJSON(),
                    dailyTime: settings.dailyTime,
                    dailyEnabled: settings.dailyEnabled,
                    periodEveTime: settings.periodEveTime,
                    periodEveEnabled: settings.periodEveEnabled,
                    // サーバー側で日付判定するために必要な設定
                    periodConfig: {
                        mode: periodMode,   
                        start: periodStart, 
                        end: periodEnd      
                    }
                }),
            });

            if (res.ok) {
                localStorage.setItem(KEYS.PUSH_SUBSCRIBED, 'true');
                console.log('[Push] Subscription synced to server');
            } else {
                console.error('[Push] Server sync failed:', res.status);
            }
        } catch (err) {
            console.error('[Push] Subscription error:', err);
        }
    },

    /**
     * 最新の状態（収支・記録日）をサーバーへ同期
     * ※ ログ保存時やチェック完了時にServiceから呼ばれる
     * * @param {Object} status 
     * @param {number} [status.balance] - 現在の収支
     * @param {string|null} [status.lastCheckDate] - 最終チェック日(YYYY-MM-DD)
     * @param {string|null} [status.lastLogDate] - 最終ログ日(YYYY-MM-DD)
     */
    updateServerStatus: async ({ balance, lastCheckDate, lastLogDate }) => {
        // 購読中でなければ送信しない
        if (localStorage.getItem(APP.STORAGE_KEYS.PUSH_SUBSCRIBED) !== 'true') return;

        try {
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.getSubscription();
            if (!subscription) return;

            const settings = NotificationManager.getSettings();
            const periodMode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || 'weekly';
            const periodStart = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START) || '0');
            const periodEnd = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE) || '0');

            // 送信データ構築
            const payload = {
                subscription: subscription.toJSON(),
                dailyTime: settings.dailyTime,
                dailyEnabled: settings.dailyEnabled,
                periodEveTime: settings.periodEveTime,
                periodEveEnabled: settings.periodEveEnabled,
                periodConfig: { mode: periodMode, start: periodStart, end: periodEnd }
            };

            // 値がある場合のみペイロードに追加（undefinedを送らない）
            if (balance !== undefined) payload.currentBalance = Math.round(balance);
            if (lastCheckDate) payload.lastCheckDate = lastCheckDate;
            if (lastLogDate) payload.lastLogDate = lastLogDate;

            // 送信 (fire-and-forget)
            fetch(`${PUSH.API_BASE}/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }).catch(e => console.error('[Push] Sync background error:', e));

        } catch (e) {
            console.error('[Push] Sync failed:', e);
        }
    },

    /**
     * Push 購読を解除（ブラウザ + サーバー）
     */
    unsubscribePush: async () => {
        try {
            if (!('PushManager' in window)) return;

            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.getSubscription();

            if (subscription) {
                // サーバーに解除通知
                await fetch(`${PUSH.API_BASE}/unsubscribe`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: subscription.endpoint }),
                }).catch(() => {});

                // ブラウザ側の購読を解除
                await subscription.unsubscribe();
                console.log('[Push] Unsubscribed');
            }

            localStorage.removeItem(KEYS.PUSH_SUBSCRIBED);
        } catch (err) {
            console.error('[Push] Unsubscribe error:', err);
        }
    },
};

// ─────────────────────────────────────────────
// 内部ヘルパー
// ─────────────────────────────────────────────

/**
 * VAPID公開鍵(Base64URL)をUint8Arrayに変換する
 * @param {string} base64String
 * @returns {Uint8Array}
 */
function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
