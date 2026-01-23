/* ui/events.js */
import { Service } from '../service.js';
import { UI, refreshUI, toggleModal } from './index.js';
import { DataManager } from '../dataManager.js';
import { Timer } from './timer.js';
import { handleSaveSettings } from './modal.js';

export const Events = {
    init: () => {
        // --- 1. アプリ内カスタムイベント ---
        
        // ビール保存
        document.addEventListener('save-beer', async (e) => {
            const data = e.detail;
            const idField = document.getElementById('editing-log-id');
            const existingId = idField && idField.value ? parseInt(idField.value) : null;
            await Service.saveBeerLog(data, existingId);
            if (data.useUntappd) {
                const query = encodeURIComponent(`${data.brewery || ''} ${data.brand || ''}`.trim());
                if(query) setTimeout(() => window.open(`https://untappd.com/search?q=${query}`, '_blank'), 100);
            }
            await refreshUI();
        });

        // チェック保存
        document.addEventListener('save-check', async (e) => {
            await Service.saveDailyCheck(e.detail);
        });

        // 運動保存
        document.addEventListener('save-exercise', async (e) => {
            const { exerciseKey, minutes, date, applyBonus, id } = e.detail;
            try {
                await Service.saveExerciseLog(exerciseKey, minutes, date, applyBonus, id);
                toggleModal('exercise-modal', false);
                const editIdField = document.getElementById('editing-exercise-id');
                if(editIdField) editIdField.value = '';
            } catch(err) {
                console.error(err);
                UI.showMessage('運動の記録に失敗しました', 'error');
            }
        });

        // 期間リセットの確認
        document.addEventListener('confirm-rollover', async () => {
        toggleModal('rollover-modal', false);
        await refreshUI();
        UI.showConfetti();
        });

        // 一括削除
        document.addEventListener('bulk-delete', async () => {
            const checkboxes = document.querySelectorAll('.log-checkbox:checked');
            const ids = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));
            if (ids.length > 0) {
                await Service.bulkDeleteLogs(ids);
            } else {
                UI.toggleEditMode();
            }
        });

        // UI更新指示
        document.addEventListener('refresh-ui', async () => await refreshUI());

        // --- 2. ボタンクリック等のDOMイベント ---

        // 設定保存
        const btnSaveSettings = document.getElementById('btn-save-settings');
        if (btnSaveSettings) btnSaveSettings.onclick = handleSaveSettings;

        // クラウド同期
        const btnCloudBackup = document.getElementById('btn-cloud-backup');
        if (btnCloudBackup) btnCloudBackup.onclick = () => DataManager.backupToCloud();

        const btnCloudRestore = document.getElementById('btn-cloud-restore');
        if (btnCloudRestore) btnCloudRestore.onclick = () => DataManager.restoreFromCloud();

        // タイマー制御
        const setupTimerBtn = (id, action) => {
            const el = document.getElementById(id);
            if (el) el.onclick = action;
        };
        setupTimerBtn('btn-timer-toggle', () => Timer.toggle());
        setupTimerBtn('btn-timer-finish', () => Timer.finish());
        setupTimerBtn('btn-timer-reset', () => Timer.reset());
    }
};