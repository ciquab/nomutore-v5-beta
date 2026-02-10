// @ts-check
import { toggleModal, showConfetti, showMessage } from './dom.js';
import { Service } from '../service.js';
import { actionRouter } from './actionRouter.js';

export const handleRollover = async (action) => {
    toggleModal('rollover-modal', false);
    try {
        if (action === 'weekly') {
            await Service.updatePeriodSettings('weekly');
            showConfetti();
            showMessage('Weeklyモードに戻りました', 'success');
        } else if (action === 'new_custom') {
            await actionRouter.handle('ui:switchTab', 'settings');
            setTimeout(() => {
                showMessage('新しい期間を設定してください', 'info');
                const pMode = document.getElementById('setting-period-mode');
                if (pMode) {
                    pMode.value = 'custom';
                    pMode.dispatchEvent(new Event('change'));
                }
            }, 300);
            return;
        } else if (action === 'extend') {
            await Service.extendPeriod(7);
            showMessage('期間を1週間延長しました', 'success');
        }
        document.dispatchEvent(new CustomEvent('refresh-ui'));
    } catch (err) {
        console.error('Rollover Action Error:', err);
        showMessage('期間の更新に失敗しました', 'error');
    }
};
