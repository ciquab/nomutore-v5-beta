// @ts-check
import { toggleModal, showConfetti, showMessage } from './dom.js';
import { Service } from '../service.js';
import { actionRouter } from './actionRouter.js';
import { EventBus, Events } from '../eventBus.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';
import { APP } from '../constants.js';


const archiveCompletedCustomPeriod = async () => {
    const startTs = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START) || '0');
    const endTs = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE) || '0');

    if (!startTs || !endTs || endTs < startTs) return;

    const nextStart = dayjs(endTs).endOf('day').add(1, 'millisecond').valueOf();
    await Service.archiveAndReset(startTs, nextStart, 'custom');
};

export const handleRollover = async (action) => {
    toggleModal('rollover-modal', false);
    try {
        if (action === 'weekly') {
            await archiveCompletedCustomPeriod();
            await Service.updatePeriodSettings('weekly');
            showConfetti();
            showMessage('Weeklyモードに戻りました', 'success');
        } else if (action === 'new_custom') {
            await archiveCompletedCustomPeriod();
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
