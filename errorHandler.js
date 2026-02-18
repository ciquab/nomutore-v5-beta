// @ts-check
import { EventBus, Events } from './eventBus.js';

/* ==========================================================================
   Global Error Handling
   ========================================================================== */

/**
 * エラーオーバーレイを表示する
 * EventBus 経由で UI 層に通知し、リスナー未登録時はフォールバックで直接 DOM を操作する。
 * @param {string} msg - エラーメッセージ
 * @param {string} source - エラー発生元ファイル
 * @param {number} lineno - 行番号
 */
export const showErrorOverlay = (msg, source, lineno) => {
    const now = new Date().toLocaleString();
    const errText = `[${now}]\nMessage: ${msg}\nSource: ${source}:${lineno}\nUA: ${navigator.userAgent}`;

    // EventBus にリスナーが登録されていれば、UI 層に処理を委譲する
    const hasListeners = EventBus.listeners[Events.ERROR_SHOW] && EventBus.listeners[Events.ERROR_SHOW].length > 0;

    if (hasListeners) {
        EventBus.emit(Events.ERROR_SHOW, { errText });
    } else {
        // フォールバック: UI 層の初期化前にエラーが発生した場合は直接 DOM を操作する
        const overlay = document.getElementById('global-error-overlay');
        const details = document.getElementById('error-details');

        if (overlay && details) {
            details.textContent = errText;
            overlay.classList.remove('hidden');

            const copyBtn = document.getElementById('btn-copy-error');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(errText)
                        .then(() => alert('エラーログをコピーしました'))
                        .catch(() => alert('コピーに失敗しました'));
                });
            }
        }
    }

    console.error('Global Error Caught:', msg);
};

/**
 * グローバルエラーリスナーの初期化
 */
export const initErrorHandler = () => {
    window.addEventListener('error', function(event) {
        showErrorOverlay(event.message, event.filename, event.lineno);
        event.preventDefault();
    });

    window.addEventListener('unhandledrejection', function(event) {
        showErrorOverlay(`Unhandled Promise Rejection: ${event.reason}`, 'Promise', 0);
    });
};
