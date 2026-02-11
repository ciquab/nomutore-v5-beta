// @ts-check
/**
 * EventBus - アプリケーション全体の Pub/Sub メッセージバス
 *
 * ロジック層（Service/Data）と UI層（DOM）の間の単方向データフローを実現する。
 * - ロジック層: データを保存して EventBus に通知を投げるだけ
 * - UI層: 通知を受け取って再描画するだけ
 *
 * このモジュールはどの層にも属さない中立的なインフラとして、
 * プロジェクトルートに配置する。
 */

export const EventBus = {
    /** @type {Object<string, Array<function>>} */
    listeners: {},

    /**
     * イベントを購読する
     * @param {string} event - イベント名
     * @param {function} callback - コールバック関数
     */
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    },

    /**
     * イベントの購読を解除する
     * @param {string} event - イベント名
     * @param {function} callback - 解除するコールバック関数
     */
    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    },

    /**
     * イベントを発火する
     * @param {string} event - イベント名
     * @param {any} data - イベントデータ
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
};

/**
 * 標準イベント名の定義
 * ロジック層 → UI層 への通知に使用する
 */
export const Events = {
    // --- State変更 (既存) ---
    STATE_CHANGE: 'stateChange',

    // --- 通知・メッセージ (Data層 → UI層) ---
    NOTIFY: 'notify',                    // { message, type, action? }

    // --- クラウド同期ステータス ---
    CLOUD_STATUS: 'cloud:statusUpdate',  // { message }

    // --- エラー表示 ---
    ERROR_SHOW: 'error:show',            // { message, source, lineno }

    // --- UI更新リクエスト ---
    REFRESH_UI: 'refreshUI',

    // --- アプリ起動 ---
    APP_SHELL_SHOW: 'app:showShell',     // アプリ画面の表示

    // --- 設定変更 ---
    SETTINGS_APPLY_PERIOD: 'settings:applyPeriodMode', // { mode }
};
