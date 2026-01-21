import { CHECK_SCHEMA, CHECK_LIBRARY, CHECK_PRESETS, CHECK_DEFAULT_IDS } from '../../constants.js';
import { db } from '../../store.js';
import { DOM, toggleModal, toggleDryDay, showMessage } from '../dom.js';
import { StateManager } from '../state.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// 内部ヘルパー: IDリストからスキーマオブジェクトの配列を生成
const getActiveSchemaFromIds = (ids) => {
    const allItems = Object.values(CHECK_LIBRARY).flat();
    return ids.map(id => allItems.find(i => i.id === id)).filter(Boolean);
};

export const CheckModal = {
    open: async (dateStr = null) => {
        const targetDate = dateStr || StateManager.selectedDate || dayjs().format('YYYY-MM-DD');
        document.getElementById('check-date').value = targetDate;

        const tsStart = dayjs(targetDate).startOf('day').valueOf();
        const tsEnd = dayjs(targetDate).endOf('day').valueOf();
        const existing = await db.checks.where('timestamp').between(tsStart, tsEnd).first();

        document.getElementById('check-is-dry').checked = existing ? existing.isDryDay : false;
        toggleDryDay(existing ? existing.isDryDay : false);
        document.getElementById('check-weight').value = (existing && existing.weight) ? existing.weight : '';

        const container = document.getElementById('check-items-container');
        container.innerHTML = '';

        let schema = JSON.parse(localStorage.getItem('nomutore_check_schema'));
        if (!schema || schema.length === 0) {
            schema = getActiveSchemaFromIds(CHECK_DEFAULT_IDS);
            localStorage.setItem('nomutore_check_schema', JSON.stringify(schema));
        }

        schema.forEach(item => {
            const isChecked = existing ? !!existing[item.id] : false;
            const div = document.createElement('div');
            div.className = `p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1 h-24 ${
                isChecked 
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-indigo-300'
            }`;
            div.onclick = () => {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
                if(cb.checked) {
                    div.className = 'p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1 h-24 bg-indigo-600 border-indigo-600 text-white shadow-md';
                } else {
                    div.className = 'p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1 h-24 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-indigo-300';
                }
            };

            div.innerHTML = `
                <span class="text-2xl">${item.icon}</span>
                <span class="text-[10px] font-bold leading-tight">${item.label}</span>
                <input type="checkbox" id="check-${item.id}" class="hidden" ${isChecked ? 'checked' : ''}>
            `;
            container.appendChild(div);
        });

        toggleModal('check-modal', true);
    },

    openLibrary: () => {
        const container = document.getElementById('library-content');
        container.innerHTML = '';
        
        const currentSchema = JSON.parse(localStorage.getItem('nomutore_check_schema') || '[]');
        const currentIds = currentSchema.map(i => i.id);

        // ★修正: カテゴリごとにループして表示
        const categories = {
            'general': '基本・メンタル',
            'diet': 'ダイエット・食事',
            'alcohol': 'お酒・飲み会',
            'muscle': '筋トレ・運動'
        };

        Object.entries(categories).forEach(([key, label]) => {
            const items = CHECK_LIBRARY[key];
            if (!items) return;

            const section = document.createElement('div');
            section.className = "mb-4";
            section.innerHTML = `<h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 sticky top-0 bg-white dark:bg-base-900 py-2 z-10">${label}</h4>`;
            
            const grid = document.createElement('div');
            grid.className = "grid grid-cols-1 sm:grid-cols-2 gap-2"; // 修正: 見やすいよう1列/2列に

            items.forEach(item => {
                const isSelected = currentIds.includes(item.id);
                const div = document.createElement('div');
                div.className = 'flex items-center justify-between p-3 border rounded-xl bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700';
                div.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg">
                            ${item.icon}
                        </div>
                        <div>
                            <div class="text-xs font-bold text-base-900 dark:text-white">${item.label}</div>
                            <div class="text-[9px] text-gray-400">${item.desc || ''}</div>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only peer library-check" value="${item.id}" ${isSelected ? 'checked' : ''}>
                        <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                `;
                grid.appendChild(div);
            });
            section.appendChild(grid);
            container.appendChild(section);
        });

        toggleModal('check-library-modal', true);
    },

    applyPreset: (type) => {
        const preset = CHECK_PRESETS[type];
        if (!preset) return;
        const presetIds = preset.ids || CHECK_DEFAULT_IDS;
        
        // ライブラリモーダルが開いている場合はチェックボックスを更新
        const checkboxes = document.querySelectorAll('.library-check');
        checkboxes.forEach(cb => {
            cb.checked = presetIds.includes(cb.value);
        });
        showMessage(`Applied preset: ${preset.label || type}`, 'success');
    },

    saveLibraryChanges: () => {
        const checkboxes = document.querySelectorAll('.library-check');
        const selectedIds = [];
        checkboxes.forEach(cb => {
            if (cb.checked) selectedIds.push(cb.value);
        });
        
        // 既存のカスタム項目（ライブラリにないもの）は維持するロジック
        let currentSchema = [];
        try { currentSchema = JSON.parse(localStorage.getItem('nomutore_check_schema') || '[]'); } catch(e){}
        
        const allLibraryIds = Object.values(CHECK_LIBRARY).flat().map(i => i.id);
        const customItems = currentSchema.filter(item => !allLibraryIds.includes(item.id));
        
        const newSchemaFromLibrary = getActiveSchemaFromIds(selectedIds);
        const finalSchema = [...newSchemaFromLibrary, ...customItems];
        
        localStorage.setItem('nomutore_check_schema', JSON.stringify(finalSchema));
        
        // 設定画面更新
        import('../Settings.js').then(m => m.Settings.renderCheckEditor());

        toggleModal('check-library-modal', false);
        showMessage('Check items updated!', 'success');
    }
};