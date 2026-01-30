/* ui/navigation.js */
import { UI } from './index.js';

let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

export const Navigation = {
    init: () => {
        // スワイプイベントの登録
        document.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, {passive: true});

        document.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            Navigation.handleSwipe();
        }, {passive: true});
    },

    handleSwipe: () => {
        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;
        const swipeThreshold = 100; // スワイプと判定する距離(px)

        // 縦スクロールの意図が強い（上下の動きの方が大きい）場合は無視
        if (Math.abs(diffY) > Math.abs(diffX)) return;

        const tabs = ['home', 'record', 'cellar', 'settings'];
        const currentTab = document.querySelector('.nav-pill-active')?.id.replace('nav-tab-', '');
        const currentIndex = tabs.indexOf(currentTab);

        if (Math.abs(diffX) > swipeThreshold) {
            if (diffX > 0 && currentIndex < tabs.length - 1) {
                // 左スワイプ -> 次のタブへ
                UI.switchTab(tabs[currentIndex + 1]);
            } else if (diffX < 0 && currentIndex > 0) {
                // 右スワイプ -> 前のタブへ
                UI.switchTab(tabs[currentIndex - 1]);
            }
        }
    }
};