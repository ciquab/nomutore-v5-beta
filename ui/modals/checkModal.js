import { CHECK_SCHEMA, CHECK_LIBRARY, CHECK_PRESETS, CHECK_DEFAULT_IDS, APP } from '../../constants.js';
import { db } from '../../store.js';
import { DOM, toggleModal, toggleDryDay, showMessage } from '../dom.js';
import { StateManager } from '../state.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// Helper: IDリストからスキーマオブジェクトの配列を生成 (modal.jsのロジックを厳密に再現)
export const getActiveSchemaFromIds = (ids) => {
    const activeSchema = [];
    ids.forEach(id => {
        let item = null;
        Object.values(CHECK_LIBRARY).forEach(category => {
            const found = category.find(i => i.id === id);
            if (found) item = found;
        });
        
        if (!item) {
            try {
                const current = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
                item = current.find(i => i.id === id);
            } catch(e){}
        }

        if (item) {
            activeSchema.push(item);
        }
    });
    return activeSchema;
};

// ★追加: 外部公開用エクスポート
export const openCheckLibrary = CheckModal.openLibrary;
export const applyPreset = CheckModal.applyPreset;
export const applyLibraryChanges = CheckModal.applyLibraryChanges;
export const openCheckModal = CheckModal.open;

// Helper: 現在設定されているID一覧を取得
const getCurrentActiveIds = () => {
    try {
        const schema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
        return schema.map(i => i.id);
    } catch(e) {
        return CHECK_DEFAULT_IDS;
    }
};

export const CheckModal = {
    // --- Daily Check Input Modal (記録用) ---
    open: async (dateStr = null) => {
        const targetDate = dateStr || StateManager.selectedDate || dayjs().format('YYYY-MM-DD');
        const dateInput = document.getElementById('check-date');
        if(dateInput) dateInput.value = targetDate;

        // UI同期ロジック
        const syncDryDayUI = (isDry) => {
            const items = document.querySelectorAll('.drinking-only');
            items.forEach(el => {
                if (isDry) {
                    el.classList.add('hidden');
                    // 休肝日なら、飲酒時のみ項目のチェックを外す
                    const cb = el.querySelector('input[type="checkbox"]');
                    if(cb) cb.checked = false;
                } else {
                    el.classList.remove('hidden');
                }
            });
            toggleDryDay(isDry);
        };

        const isDryCheck = document.getElementById('check-is-dry');
        if (isDryCheck) {
            isDryCheck.onclick = (e) => syncDryDayUI(e.target.checked);
            isDryCheck.disabled = false;
        }

        const dryLabelContainer = isDryCheck ? isDryCheck.closest('#drinking-section') : null;
        const dryLabelText = dryLabelContainer ? dryLabelContainer.querySelector('span.font-bold') : null;
        if (dryLabelText) dryLabelText.innerHTML = "Is today a Dry Day?";
        if (dryLabelContainer) dryLabelContainer.classList.remove('opacity-50', 'pointer-events-none');

        // データ取得
        const tsStart = dayjs(targetDate).startOf('day').valueOf();
        const tsEnd = dayjs(targetDate).endOf('day').valueOf();
        
        const [existing, beerLogsCount] = await Promise.all([
            db.checks.where('timestamp').between(tsStart, tsEnd).first(),
            db.logs.where('timestamp').between(tsStart, tsEnd).filter(l => l.type === 'beer').count()
        ]);

        document.getElementById('check-weight').value = (existing && existing.weight) ? existing.weight : '';

        // チェック項目の描画 (modal.jsのHTML構造を厳密に再現)
        const container = document.getElementById('check-items-container');
        container.innerHTML = '';

        let schema = [];
        try {
            schema = JSON.parse(localStorage.getItem('nomutore_check_schema'));
        } catch(e) {}
        if (!schema || schema.length === 0) {
            schema = getActiveSchemaFromIds(CHECK_DEFAULT_IDS);
            localStorage.setItem('nomutore_check_schema', JSON.stringify(schema));
        }

        schema.forEach(item => {
            const div = document.createElement('div');
            const visibilityClass = item.drinking_only ? 'drinking-only' : '';
            if (visibilityClass) div.className = visibilityClass;
            
            // ★復元: modal.jsと同じラベルベースのHTML構造
            div.innerHTML = `
                <label class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer border border-transparent hover:border-indigo-200 dark:hover:border-indigo-700 transition h-full">
                    <input type="checkbox" id="check-${item.id}" class="rounded text-indigo-600 focus:ring-indigo-500 w-5 h-5 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                    <div class="flex flex-col">
                        <span class="text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1">
                            <span>${item.icon}</span> ${item.label}
                        </span>
                        ${item.desc ? `<span class="text-[9px] text-gray-400">${item.desc}</span>` : ''}
                    </div>
                </label>
            `;
            container.appendChild(div);

            // ★復元: 飲酒時のみ項目をチェックしたら、休肝日チェックを外すロジック
            if (item.drinking_only) {
                const cb = div.querySelector('input[type="checkbox"]');
                if (cb) {
                    cb.addEventListener('change', () => {
                        if (cb.checked) {
                            const dryCheck = document.getElementById('check-is-dry');
                            if (dryCheck && dryCheck.checked) {
                                dryCheck.checked = false;
                                syncDryDayUI(false); // UI更新
                            }
                        }
                    });
                }
            }
        });

        // 値のセット用ヘルパー
        const setCheck = (id, val) => {
            const el = document.getElementById(id);
            if(el) el.checked = !!val;
        };

        // 初期状態の反映
        const saveBtn = document.getElementById('btn-save-check');
        
        // Reset
        setCheck('check-is-dry', false);
        syncDryDayUI(false);
        if (saveBtn) saveBtn.textContent = 'Save Check';

        if (existing) {
            setCheck('check-is-dry', existing.isDryDay);
            syncDryDayUI(existing.isDryDay);
            
            schema.forEach(item => {
                if (existing[item.id] !== undefined) {
                    setCheck(`check-${item.id}`, existing[item.id]);
                }
            });

            if (saveBtn) {
                const isAutoGenerated = (existing.weight === null); 
                saveBtn.textContent = isAutoGenerated ? 'Save Check' : 'Update Check';
            }
        }

        if (beerLogsCount > 0) {
            setCheck('check-is-dry', false);
            syncDryDayUI(false);
            if (isDryCheck) isDryCheck.disabled = true;
            if (dryLabelContainer) dryLabelContainer.classList.add('opacity-50', 'pointer-events-none');
            if (dryLabelText) dryLabelText.innerHTML = "Is today a Dry Day? <span class='text-[10px] text-red-500 font-bold ml-2'>(Alcohol Recorded)</span>";
        }

        toggleModal('check-modal', true);
    },

    // --- Library Selection Modal (設定用) ---
    // ここはmodal.jsでもカード型だったのでそのまま維持
    openLibrary: () => {
        const container = document.getElementById('library-content');
        if (!container) return;
        container.innerHTML = '';

        const activeIds = new Set(getCurrentActiveIds());

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
            grid.className = "grid grid-cols-1 sm:grid-cols-2 gap-2";

            items.forEach(item => {
                const isActive = activeIds.has(item.id);
                const btn = document.createElement('div');
                btn.className = `p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 ${
                    isActive 
                    ? 'bg-indigo-50 border-indigo-500 dark:bg-indigo-900/30 dark:border-indigo-500' 
                    : 'bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300'
                }`;
                
                btn.onclick = () => {
                    const checkbox = document.getElementById(`lib-chk-${item.id}`);
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        if (checkbox.checked) {
                            btn.className = 'p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 bg-indigo-50 border-indigo-500 dark:bg-indigo-900/30 dark:border-indigo-500';
                            const icon = btn.querySelector('.check-icon');
                            if(icon) icon.innerHTML = '<i class="ph-fill ph-check-circle text-indigo-500"></i>';
                        } else {
                            btn.className = 'p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300';
                            const icon = btn.querySelector('.check-icon');
                            if(icon) icon.innerHTML = '<i class="ph-bold ph-circle text-gray-300"></i>';
                        }
                    }
                };

                btn.innerHTML = `
                    <input type="checkbox" id="lib-chk-${item.id}" class="hidden library-check" ${isActive ? 'checked' : ''} value="${item.id}">
                    <span class="text-2xl">${item.icon}</span>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-bold text-base-900 dark:text-white truncate">${item.label}</p>
                        <p class="text-[9px] text-gray-400 truncate">${item.desc || ''}</p>
                    </div>
                    <div class="check-icon">
                        ${isActive ? '<i class="ph-fill ph-check-circle text-indigo-500"></i>' : '<i class="ph-bold ph-circle text-gray-300"></i>'}
                    </div>
                `;
                grid.appendChild(btn);
            });

            section.appendChild(grid);
            container.appendChild(section);
        });

        toggleModal('check-library-modal', true);
    },

    applyPreset: (type) => {
        const preset = CHECK_PRESETS[type];
        if (!preset) return;

        if (!confirm(`「${preset.label}」プリセットを適用しますか？\n（現在のカスタム項目は維持されますが、ライブラリ選択項目は上書きされます）`)) return;

        const selectedIds = preset.ids;
        
        let currentSchema = [];
        try {
            currentSchema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
        } catch(e){}

        const libraryIds = new Set();
        Object.values(CHECK_LIBRARY).flat().forEach(i => libraryIds.add(i.id));

        const customItems = currentSchema.filter(item => !libraryIds.has(item.id));

        const newSchemaFromLibrary = getActiveSchemaFromIds(selectedIds);
        const finalSchema = [...newSchemaFromLibrary, ...customItems];

        localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(finalSchema));
        
        const modal = document.getElementById('check-library-modal');
        if(modal && !modal.classList.contains('hidden')) {
            CheckModal.openLibrary(); 
        }
        
        import('../Settings.js').then(m => m.Settings.renderCheckEditor());
        
        showMessage(`プリセット「${preset.label}」を適用しました}`, 'success');
    },

    saveLibraryChanges: () => {
        const checkedInputs = document.querySelectorAll('#library-content input[type="checkbox"]:checked');
        const selectedIds = Array.from(checkedInputs).map(input => input.value);
        
        let currentSchema = [];
        try { currentSchema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]'); } catch(e){}
        
        const libraryIds = new Set();
        Object.values(CHECK_LIBRARY).flat().forEach(i => libraryIds.add(i.id));
        const customItems = currentSchema.filter(item => !libraryIds.has(item.id));

        const newSchemaFromLibrary = getActiveSchemaFromIds(selectedIds);
        const finalSchema = [...newSchemaFromLibrary, ...customItems];

        localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(finalSchema));
        
        import('../Settings.js').then(m => m.Settings.renderCheckEditor());

        toggleModal('check-library-modal', false);
        showMessage('チェック項目を更新しました', 'success');
    }

};

