import { toggleModal } from '../dom.js';
import { StateManager } from '../state.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// UIへの参照解決のため、window.UI を使用する前提とする
// (循環参照を避けるため)

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
        const hiddenDate = document.getElementById('action-menu-target-date');
        const dateStr = hiddenDate ? hiddenDate.value : (StateManager.selectedDate || dayjs().format('YYYY-MM-DD'));
        
        toggleModal('action-menu-modal', false);

        // 少し遅延させて次のモーダルを開く
        setTimeout(() => {
            if (!window.UI) return;
            switch(type) {
                case 'beer':
                    window.UI.openBeerModal(null, dateStr);
                    break;
                case 'check':
                    window.UI.openCheckModal(dateStr);
                    break;
                case 'exercise':
                    window.UI.openManualInput(dateStr);
                    break;
                case 'timer':
                    window.UI.openTimer(true);
                    break;
            }
        }, 200);
    }
};