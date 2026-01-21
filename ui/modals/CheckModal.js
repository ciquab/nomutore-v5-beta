import { CHECK_SCHEMA, CHECK_LIBRARY, CHECK_PRESETS, CHECK_DEFAULT_IDS } from '../../constants.js';
import { db } from '../../store.js';
import { DOM, toggleModal, toggleDryDay, showMessage } from '../dom.js';
import { StateManager } from '../state.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const CheckModal = {
    open: async (dateStr = null) => {
        const targetDate = dateStr || StateManager.selectedDate || dayjs().format('YYYY-MM-DD');
        document.getElementById('check-date').value = targetDate;

        // DBからその日のデータを取得
        const tsStart = dayjs(targetDate).startOf('day').valueOf();
        const tsEnd = dayjs(targetDate).endOf('day').valueOf();
        const existing = await db.checks.where('timestamp').between(tsStart, tsEnd).first();

        // フォームリセット & 初期化
        document.getElementById('check-is-dry').checked = existing ? existing.isDryDay : false;
        toggleDryDay(existing ? existing.isDryDay : false);
        document.getElementById('check-weight').value = (existing && existing.weight) ? existing.weight : '';

        // 動的フォーム生成
        const container = document.getElementById('check-items-container');
        container.innerHTML = '';

        // 現在有効なチェック項目スキーマを取得
        let schema = JSON.parse(localStorage.getItem('nomutore_check_schema'));
        if (!schema || schema.length === 0) {
            // 初期値がない場合はデフォルトをロード
            schema = CHECK_DEFAULT_IDS.map(id => CHECK_LIBRARY.find(i => i.id === id)).filter(Boolean);
            localStorage.setItem('nomutore_check_schema', JSON.stringify(schema));
        }

        schema.forEach(item => {
            const isChecked = existing ? !!existing[item.id] : false;
            const div = document.createElement('div');
            // チェックボックスデザイン
            div.className = `p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1 h-24 ${
                isChecked 
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-indigo-300'
            }`;
            div.onclick = () => {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
                // UI更新
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

    // --- Library & Settings ---
    openLibrary: () => {
        const container = document.getElementById('library-content');
        container.innerHTML = '';
        
        const currentSchema = JSON.parse(localStorage.getItem('nomutore_check_schema') || '[]');
        const currentIds = currentSchema.map(i => i.id);

        CHECK_LIBRARY.forEach(item => {
            const isSelected = currentIds.includes(item.id);
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-800';
            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xl">
                        ${item.icon}
                    </div>
                    <div>
                        <div class="text-sm font-bold text-base-900 dark:text-white">${item.label}</div>
                        <div class="text-[10px] text-gray-400">${item.category || 'General'}</div>
                    </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" class="sr-only peer library-check" value="${item.id}" ${isSelected ? 'checked' : ''}>
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
            `;
            container.appendChild(div);
        });

        toggleModal('check-library-modal', true);
    },

    applyPreset: (type) => {
        const presetIds = CHECK_PRESETS[type] || CHECK_DEFAULT_IDS;
        const checkboxes = document.querySelectorAll('.library-check');
        checkboxes.forEach(cb => {
            cb.checked = presetIds.includes(cb.value);
        });
        showMessage(`Applied preset: ${type}`, 'success');
    },

    saveLibraryChanges: () => {
        const checkboxes = document.querySelectorAll('.library-check');
        const newSchema = [];
        checkboxes.forEach(cb => {
            if (cb.checked) {
                const item = CHECK_LIBRARY.find(i => i.id === cb.value);
                if (item) newSchema.push(item);
            }
        });
        
        localStorage.setItem('nomutore_check_schema', JSON.stringify(newSchema));
        
        // 設定画面のリストも更新
        const editorList = document.getElementById('check-editor-list');
        if (editorList) {
            import('../Settings.js').then(m => m.Settings.renderCheckEditor());
        }

        toggleModal('check-library-modal', false);
        showMessage('Check items updated!', 'success');
    }
};