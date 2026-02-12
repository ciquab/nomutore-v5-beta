// @ts-check
/**
 * Gesture Handler - スワイプ・タッチ・FABスクロール制御
 * UI層の責務としてジェスチャー操作を管理する。
 */

// --- Touch State ---
let touchStartX = null;
let touchStartY = null;
let touchEndX = 0;
let touchEndY = 0;

/** @type {function(string): void} */
let _onSwitchTab = null;

/**
 * スワイプ判定ロジック
 */
const handleSwipe = () => {
    console.log('handleSwipe fired');
    if (touchStartX === null) return;

    // モーダルが表示中ならスワイプをブロック
    const modals = document.querySelectorAll('[id$="-modal"], [id$="-modal-container"], .modal-bg');
    const activeModal = Array.from(modals).find(el => {
        return el.offsetParent !== null;
    });
    if (activeModal) return;

    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;
    const swipeThreshold = 80;

    // 縦スクロール優先なら無視
    if (Math.abs(diffY) > Math.abs(diffX)) return;

    const tabs = ['home', 'record', 'cellar', 'settings'];
    const activeNav = document.querySelector('.nav-pill-active');
    if (!activeNav) return;

    const currentTab = activeNav.id.replace('nav-tab-', '');
    const currentIndex = tabs.indexOf(currentTab);

    if (Math.abs(diffX) > swipeThreshold) {
        let targetTabIndex = -1;

        if (diffX > 0 && currentIndex < tabs.length - 1) {
            targetTabIndex = currentIndex + 1; // 次のタブへ
        } else if (diffX < 0 && currentIndex > 0) {
            targetTabIndex = currentIndex - 1; // 前のタブへ
        }

        if (targetTabIndex !== -1 && _onSwitchTab) {
            _onSwitchTab(tabs[targetTabIndex]);
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    }

    // 初期化
    touchStartX = null;
    touchStartY = null;
};

/**
 * グローバルイベントリスナーの設定
 * - スワイプ操作
 * - FABのスクロール制御
 * @param {function(string): void} onSwitchTab - タブ切り替えコールバック
 */
export const setupGlobalListeners = (onSwitchTab) => {
    _onSwitchTab = onSwitchTab;

    // --- 1. スワイプ操作 ---
    document.addEventListener('touchstart', (e) => {
        if (e.target.closest('.overflow-x-auto, .chart-container')) {
            touchStartX = null;
            touchStartY = null;
            return;
        }
    
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });
    
    document.addEventListener('touchend', (e) => {
        if (touchStartX === null || touchStartY === null) return;
    
        touchEndX = e.changedTouches[0].clientX;
        touchEndY = e.changedTouches[0].clientY;
    
        handleSwipe();
    }, { passive: true });

    // --- 2. FABのスクロール制御 (強化版) ---
    let lastScrollTop = 0;
    const fab = document.getElementById('btn-fab-fixed');

    // スロットリング（頻度制限）をあえて入れず、ブラウザの最適化に任せます
    document.addEventListener('scroll', () => {
        if (!fab || fab.classList.contains('scale-0') || fab.dataset.animating === 'true') return;

        // 複数の取得方法を試行（ブラウザ互換性）
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
        const diff = scrollTop - lastScrollTop;

        // 下にスクロール（diff > 0）かつ 一定以上(20px)スクロールした
        if (diff > 5 && scrollTop > 20) {
            fab.style.transform = 'translateY(110px)';
            fab.style.opacity = '0';
        }
        // 上にスクロール、または最上部付近
        else if (diff < -5 || scrollTop <= 10) {
            fab.style.removeProperty('transform');
            fab.style.removeProperty('opacity');
        }

        lastScrollTop = scrollTop;
    }, true); // Capture フェーズで子要素のスクロールも拾う
};



