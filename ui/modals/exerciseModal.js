import { EXERCISE, APP } from '../../constants.js';
import { toggleModal } from '../dom.js';
import { StateManager } from '../state.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const ExerciseModal = {
    open: (e, log = null) => {
        const idField = document.getElementById('editing-exercise-id');
        const minField = document.getElementById('manual-minutes');
        const dateField = document.getElementById('manual-date');
        const bonusCheck = document.getElementById('manual-apply-bonus');
        const saveBtn = document.getElementById('btn-save-exercise'); 
        const deleteBtn = document.getElementById('btn-delete-exercise');

        if(idField) idField.value = '';
        if(minField) minField.value = '';
        
        const targetDate = StateManager.selectedDate || (log ? dayjs(log.timestamp).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));
        if(dateField) dateField.value = targetDate;

        const typeSel = document.getElementById('exercise-select');
        if (typeSel && typeSel.children.length === 0) {
            Object.keys(EXERCISE).forEach(k => {
                const o = document.createElement('option');
                o.value = k;
                o.textContent = EXERCISE[k].icon + ' ' + EXERCISE[k].label;
                typeSel.appendChild(o);
            });
        }

        if (log) {
            if(idField) idField.value = log.id;
            if(minField) minField.value = log.minutes || 30;
            if (typeSel && log.exerciseKey) typeSel.value = log.exerciseKey;
            
            if (saveBtn) saveBtn.textContent = 'Update Workout';
            
            if (deleteBtn) deleteBtn.classList.remove('hidden');
            
            if (bonusCheck) {
                const hasBonus = (log.applyBonus !== undefined) ? log.applyBonus : (log.memo && log.memo.includes('Bonus'));
                bonusCheck.checked = !!hasBonus;
            }
        } else {
            if (saveBtn) saveBtn.textContent = 'Save Workout';
            
            const defaultEx = localStorage.getItem(APP.STORAGE_KEYS.DEFAULT_RECORD_EXERCISE) || APP.DEFAULTS.DEFAULT_RECORD_EXERCISE;
            if (typeSel) typeSel.value = defaultEx;

            if (deleteBtn) deleteBtn.classList.add('hidden');
            if (bonusCheck) bonusCheck.checked = true;
        }
        
        toggleModal('exercise-modal', true);
    }
};