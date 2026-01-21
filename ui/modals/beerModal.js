import { CALORIES, SIZE_DATA, STYLE_METADATA } from '../../constants.js';
import { db } from '../../store.js';
import { DOM, toggleModal, escapeHtml, showMessage } from '../dom.js';
import { StateManager } from '../state.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const BeerModal = {
    init: () => {
        BeerModal.updateSelectOptions();
    },

    getFormData: () => {
        const dateVal = document.getElementById('beer-date').value;
        const brewery = document.getElementById('beer-brewery').value.trim();
        const brand = document.getElementById('beer-brand').value.trim();
        const rating = parseInt(document.getElementById('beer-rating').value) || 0;
        const memo = document.getElementById('beer-memo').value.trim();
        const untappdCheck = document.getElementById('untappd-check');
        const useUntappd = untappdCheck ? untappdCheck.checked : false;

        // タイムスタンプ生成 (正午基準)
        const ts = dateVal 
            ? dayjs(dateVal).startOf('day').add(12, 'hour').valueOf() 
            : dayjs().startOf('day').add(12, 'hour').valueOf(); 
        
        const isCustom = !document.getElementById('beer-input-custom').classList.contains('hidden');
        
        const styleSel = document.getElementById('beer-select');
        const style = styleSel.options[styleSel.selectedIndex]?.value || '国産ピルスナー';
        
        const sizeSel = document.getElementById('beer-size');
        const size = parseInt(sizeSel.options[sizeSel.selectedIndex]?.value || '350');
        
        const count = parseFloat(document.getElementById('beer-count').value) || 1;
        
        const customAbv = Math.abs(parseFloat(document.getElementById('custom-abv').value) || 5.0);
        const customMl = Math.abs(parseInt(document.getElementById('custom-amount').value) || 350);

        return {
            timestamp: ts,
            brewery, brand, rating, memo,
            style, size, count,
            isCustom,
            abv: customAbv,
            ml: customMl,
            type: 'beer', 
            useUntappd
        };
    },

    resetForm: (keepDate = false) => {
        if (!keepDate) document.getElementById('beer-date').value = dayjs().format('YYYY-MM-DD');
        
        const idField = document.getElementById('editing-log-id');
        if(idField) idField.value = '';
        
        document.getElementById('beer-count').value = 1;
        document.getElementById('beer-brewery').value = '';
        document.getElementById('beer-brand').value = '';
        document.getElementById('beer-rating').value = '0';
        document.getElementById('beer-memo').value = '';
        document.getElementById('custom-abv').value = '';
        document.getElementById('custom-amount').value = '';
        
        const untappdCheck = document.getElementById('untappd-check');
        if(untappdCheck) untappdCheck.checked = false;
        
        BeerModal.switchTab('preset');
    },

    searchUntappd: () => {
        const brewery = document.getElementById('beer-brewery').value.trim();
        const brand = document.getElementById('beer-brand').value.trim();
        if (!brand) { showMessage('銘柄名を入力してください', 'error'); return; }
        const query = encodeURIComponent(`${brewery} ${brand}`.trim());
        window.open(`https://untappd.com/search?q=${query}`, '_blank');
    },

    open: (e, dateStr = null, log = null) => {
        BeerModal.resetForm();
        BeerModal.updateSelectOptions();

        if (dateStr) document.getElementById('beer-date').value = dateStr;
        else if (log) document.getElementById('beer-date').value = dayjs(log.timestamp).format('YYYY-MM-DD');

        if (log) {
            const idField = document.getElementById('editing-log-id');
            if(idField) idField.value = log.id;
            document.getElementById('beer-count').value = log.count || 1;
            document.getElementById('beer-brewery').value = log.brewery || '';
            document.getElementById('beer-brand').value = log.brand || log.name || ''; 
            document.getElementById('beer-rating').value = log.rating || 0;
            document.getElementById('beer-memo').value = log.memo || '';
            
            if (log.isCustom || log.type === 'brew') { // 旧データ互換
                BeerModal.switchTab('custom');
                document.getElementById('custom-abv').value = log.abv || 5.0;
                document.getElementById('custom-amount').value = log.rawAmount || log.ml || 350;
            } else {
                BeerModal.switchTab('preset');
                const styleSel = document.getElementById('beer-select');
                const sizeSel = document.getElementById('beer-size');
                if (log.style) styleSel.value = log.style;
                if (log.size) sizeSel.value = log.size;
            }
        }
        
        const delBtn = document.getElementById('btn-delete-beer');
        if (delBtn) {
            if (log) { delBtn.classList.remove('hidden'); delBtn.classList.add('flex'); }
            else { delBtn.classList.add('hidden'); delBtn.classList.remove('flex'); }
        }
        
        const saveBtn = document.getElementById('btn-save-beer');
        if (saveBtn) {
            saveBtn.textContent = log ? 'Update Drink' : 'Save Drink';
        }

        toggleModal('beer-modal', true);
    },

    switchTab: (mode) => {
        const preset = document.getElementById('beer-input-preset');
        const custom = document.getElementById('beer-input-custom');
        const btnPreset = document.getElementById('tab-beer-preset');
        const btnCustom = document.getElementById('tab-beer-custom');
        
        const activeClasses = ['bg-indigo-600', 'text-white', 'shadow-sm'];
        const inactiveClasses = ['text-gray-500', 'hover:bg-base-200', 'dark:hover:bg-base-800'];

        // クラスのリセット
        btnPreset.classList.remove(...activeClasses);
        btnPreset.classList.add(...inactiveClasses);
        btnCustom.classList.remove(...activeClasses);
        btnCustom.classList.add(...inactiveClasses);

        if (mode === 'preset') {
            preset.classList.remove('hidden');
            custom.classList.add('hidden');
            btnPreset.classList.remove(...inactiveClasses);
            btnPreset.classList.add(...activeClasses);
        } else {
            preset.classList.add('hidden');
            custom.classList.remove('hidden');
            btnCustom.classList.remove(...inactiveClasses);
            btnCustom.classList.add(...activeClasses);
        }
    },

    adjustCount: (delta) => {
        const el = document.getElementById('beer-count');
        let v = parseFloat(el.value) || 1;
        v = Math.max(0.5, v + delta); // 0.5単位等は許容するがマイナスは防ぐ
        el.value = v;
    },

    updateSelectOptions: () => {
        const styleSel = document.getElementById('beer-select');
        const sizeSel = document.getElementById('beer-size');
        
        if (styleSel && styleSel.children.length === 0) {
            const source = (typeof STYLE_METADATA !== 'undefined') ? STYLE_METADATA : CALORIES.STYLES;
            const styles = Object.keys(source || {});
            
            styles.forEach(key => {
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

// ★追加: 外部ファイルが利用するための名前付きエクスポート
export const updateBeerSelectOptions = BeerModal.updateSelectOptions;