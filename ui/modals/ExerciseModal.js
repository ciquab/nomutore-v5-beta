import { EXERCISE } from '../../constants.js';
import { toggleModal } from '../dom.js';
import { StateManager } from '../state.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const ExerciseModal = {
    open: (e, log = null) => {
        const targetDate = StateManager.selectedDate || dayjs().format('YYYY-MM-DD');
        document.getElementById('manual-date').value = targetDate;
        
        // セレクトボックス生成
        const select = document.getElementById('exercise-select');
        if (select.children.length === 0) {
            Object.entries(EXERCISE).forEach(([key, val]) => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = `${val.icon} ${val.label}`;
                select.appendChild(opt);
            });
        }

        // 編集モード判定
        if (log) {
            document.getElementById('editing-exercise-id').value = log.id;
            // log.timestamp から日付を復元
            document.getElementById('manual-date').value = dayjs(log.timestamp).format('YYYY-MM-DD');
            document.getElementById('manual-minutes').value = log.minutes;
            select.value = log.exerciseKey || 'walking';
            // 削除ボタン表示
            document.getElementById('btn-delete-exercise').classList.remove('hidden');
        } else {
            document.getElementById('editing-exercise-id').value = '';
            document.getElementById('manual-minutes').value = '';
            select.value = 'walking'; // default
            // 削除ボタン非表示
            document.getElementById('btn-delete-exercise').classList.add('hidden');
        }

        toggleModal('exercise-modal', true);
    }
};