import { CALORIES, SIZE_DATA, STYLE_METADATA } from '../../constants.js';
import { Calc } from '../../logic.js';
import { db } from '../../store.js';
import { DOM, toggleModal, escapeHtml, showMessage } from '../dom.js';
import { StateManager } from '../state.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const BeerModal = {
    init: () => {
        // セレクトボックスの初期化
        BeerModal.updateSelectOptions();
    },

    open: async (e, dateStr = null, editLog = null) => {
        // ... (元の openBeerModal のロジック) ...
        const targetDate = dateStr || StateManager.selectedDate || dayjs().format('YYYY-MM-DD');
        
        document.getElementById('editing-log-id').value = editLog ? editLog.id : '';
        document.getElementById('beer-date').value = targetDate;
        
        // 削除ボタンの表示制御
        const delBtn = document.getElementById('btn-delete-beer');
        if(delBtn) delBtn.classList.toggle('hidden', !editLog);

        if (editLog) {
            // 編集モード
            BeerModal.setFormData(editLog);
        } else {
            // 新規モード
            BeerModal.resetForm();
        }
        
        toggleModal('beer-modal', true);
    },

    resetForm: () => {
        document.getElementById('beer-count').value = 1;
        document.getElementById('beer-memo').value = '';
        document.getElementById('beer-rating').value = 0;
        document.getElementById('beer-brewery').value = '';
        document.getElementById('beer-brand').value = '';
        document.getElementById('untappd-check').checked = false;
        
        // プリセットタブをデフォルトに
        BeerModal.switchTab('preset');
    },

    setFormData: (log) => {
        document.getElementById('beer-count').value = log.count || 1;
        document.getElementById('beer-memo').value = log.memo || '';
        document.getElementById('beer-rating').value = log.rating || 0;
        document.getElementById('beer-brewery').value = log.brewery || '';
        document.getElementById('beer-brand').value = log.brand || '';
        
        if (log.isCustom) {
            BeerModal.switchTab('custom');
            document.getElementById('custom-abv').value = log.abv || '';
            document.getElementById('custom-amount').value = log.rawAmount || '';
        } else {
            BeerModal.switchTab('preset');
            document.getElementById('beer-select').value = log.style || 'Lager';
            document.getElementById('beer-size').value = log.size || '350';
        }
    },

    getFormData: () => {
        const isCustom = document.getElementById('tab-beer-custom').classList.contains('bg-indigo-600');
        const date = document.getElementById('beer-date').value;
        const count = parseFloat(document.getElementById('beer-count').value) || 1;
        const memo = document.getElementById('beer-memo').value.trim();
        const rating = parseInt(document.getElementById('beer-rating').value, 10);
        const brewery = document.getElementById('beer-brewery').value.trim();
        const brand = document.getElementById('beer-brand').value.trim();
        const openUntappd = document.getElementById('untappd-check').checked;

        let data = { date, count, memo, rating, brewery, brand, openUntappd, isCustom };

        if (isCustom) {
            data.abv = parseFloat(document.getElementById('custom-abv').value);
            data.amount = parseInt(document.getElementById('custom-amount').value, 10);
            if (!data.abv || !data.amount) return null; // Validation Error
        } else {
            data.style = document.getElementById('beer-select').value;
            data.size = document.getElementById('beer-size').value;
        }
        return data;
    },

    switchTab: (mode) => {
        const btnPreset = document.getElementById('tab-beer-preset');
        const btnCustom = document.getElementById('tab-beer-custom');
        const inputPreset = document.getElementById('beer-input-preset');
        const inputCustom = document.getElementById('beer-input-custom');

        if (mode === 'preset') {
            btnPreset.className = 'flex-1 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white shadow-sm transition';
            btnCustom.className = 'flex-1 py-2 text-xs font-bold rounded-xl text-gray-500 hover:bg-base-200 dark:hover:bg-base-800 transition';
            inputPreset.classList.remove('hidden');
            inputCustom.classList.add('hidden');
        } else {
            btnPreset.className = 'flex-1 py-2 text-xs font-bold rounded-xl text-gray-500 hover:bg-base-200 dark:hover:bg-base-800 transition';
            btnCustom.className = 'flex-1 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white shadow-sm transition';
            inputPreset.classList.add('hidden');
            inputCustom.classList.remove('hidden');
        }
    },

    adjustCount: (delta) => {
        const input = document.getElementById('beer-count');
        let val = parseFloat(input.value) || 1;
        val += delta;
        if (val < 0.5) val = 0.5;
        input.value = val; // 整数丸めなしでOK（ハーフパイント対応）
    },

    searchUntappd: () => {
        const brewery = document.getElementById('beer-brewery').value.trim();
        const brand = document.getElementById('beer-brand').value.trim();
        const query = `${brewery} ${brand}`.trim();
        if (query) {
            window.open(`https://untappd.com/search?q=${encodeURIComponent(query)}`, '_blank');
        } else {
            showMessage('詳細情報の入力が必要です', 'error');
        }
    },

    updateSelectOptions: () => {
        const styleSel = document.getElementById('beer-select');
        const sizeSel = document.getElementById('beer-size');
        
        if (styleSel && styleSel.children.length === 0) {
            const source = (typeof STYLE_METADATA !== 'undefined') ? STYLE_METADATA : CALORIES.STYLES;
            Object.keys(source || {}).forEach(key => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = key;
                styleSel.appendChild(opt);
            });
        }

        if (sizeSel && sizeSel.children.length === 0) {
            Object.entries(SIZE_DATA).forEach(([key, val]) => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = val.label;
                sizeSel.appendChild(opt);
            });
            sizeSel.value = '350'; 
        }
    }
};