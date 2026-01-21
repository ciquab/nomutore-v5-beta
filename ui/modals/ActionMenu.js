import { toggleModal } from '../dom.js';
import { StateManager } from '../state.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const ActionMenu = {
    open: (dateStr = null) => {
        const targetDate = dateStr || dayjs().format('YYYY-MM-DD');
        StateManager.setSelectedDate(targetDate);
        
        const label = document.getElementById('action-menu-date-label');
        if(label) label.textContent = dayjs(targetDate).format('MM/DD (ddd)');
        
        const hiddenDate = document.getElementById('action-menu-target-date');
        if(hiddenDate) hiddenDate.value = targetDate;

        toggleModal('action-menu-modal', true);
    },

    handleSelect: (type) => {
        // UI.xxx がまだグローバルにないので、動的インポートまたはイベント経由で呼ぶ設計にするが、
        // ここでは UI オブジェクトが統合された前提で window.UI を呼ぶか、
        // index.js でバインドされた関数を呼ぶ。
        
        // 一旦モーダルを閉じる
        toggleModal('action-menu-modal', false);

        // 少し遅延させて次のモーダルを開く（アニメーション競合回避）
        setTimeout(() => {
            switch(type) {
                case 'beer':
                    window.UI.openBeerModal();
                    break;
                case 'check':
                    window.UI.openCheckModal();
                    break;
                case 'exercise':
                    window.UI.openManualInput();
                    break;
                case 'timer':
                    window.UI.openTimer(true); // reset=true
                    break;
            }
        }, 200);
    }
};