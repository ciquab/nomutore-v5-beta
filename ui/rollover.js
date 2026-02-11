// @ts-check
import { toggleModal, showConfetti, showMessage } from './dom.js';
import { Service } from '../service.js';
import { actionRouter } from './actionRouter.js';
import { EventBus, Events } from '../eventBus.js';

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
                // EventBus 経由で UI層（設定画面）に期間モード変更を依頼する
                EventBus.emit(Events.SETTINGS_APPLY_PERIOD, { mode: 'custom' });
            }, 300);
            return;
        } else if (action === 'extend') {
            await Service.extendPeriod(7);
            showMessage('期間を1週間延長しました', 'success');
        }
        EventBus.emit(Events.REFRESH_UI);
    } catch (err) {
        console.error('Rollover Action Error:', err);
        showMessage('期間の更新に失敗しました', 'error');
    }
};
