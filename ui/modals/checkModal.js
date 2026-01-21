import { CHECK_SCHEMA, CHECK_LIBRARY, CHECK_PRESETS, CHECK_DEFAULT_IDS, APP } from '../../constants.js';
import { db } from '../../store.js';
import { DOM, toggleModal, toggleDryDay, showMessage } from '../dom.js';
import { StateManager } from '../state.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// ヘルパー: IDリストからアクティブなスキーマを生成（カスタム項目維持）
export const getActiveSchemaFromIds = (ids) => {
    const activeSchema = [];
    const allLibraryItems = Object.values(CHECK_LIBRARY).flat();

    ids.forEach(id => {
        let item = allLibraryItems.find(i => i.id === id);
        
        // ライブラリにない場合は既存の設定（カスタム項目）から探す
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

// ヘルパー: 現在設定されているID一覧を取得
const getCurrentActiveIds = () => {
    try {
        const schema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
        return schema.map(i => i.id);
    } catch(e) {
        return CHECK_DEFAULT_IDS;
    }
};

export const CheckModal = {
    // --- モーダルを開く ---
    open: async (dateStr = null) => {
        const targetDate = dateStr || StateManager.selectedDate || dayjs().format('YYYY-MM-DD');
        const dateInput = document.getElementById('check-date');
        if(dateInput) dateInput.value = targetDate;

        // UI同期: 休肝日スイッチと飲酒項目の表示制御
        const syncDryDayUI = (isDry) => {
            const items = document.querySelectorAll('.drinking-only');
            items.forEach(el => {
                if (isDry) {
                    el.classList.add('hidden');
                    // 隠すときはチェックを外す
                    const cb = el.querySelector('input');
                    if(cb && cb.checked) {
                        cb.checked = false;
                        // 親要素のスタイルもリセット
                        el.className = el.className.replace('bg-indigo-600 border-indigo-600 text-white shadow-md', 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-indigo-300');
                    }
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

        // チェック項目の描画
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
            const isChecked = existing ? !!existing[item.id] : false;
            const div = document.createElement('div');
            if (item.drinking_only) div.classList.add('drinking-only');

            const baseClass = "p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1 h-24";
            const checkedClass = "bg-indigo-600 border-indigo-600 text-white shadow-md";
            const uncheckedClass = "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-indigo-300";
            
            // 初期表示制御
            let isHidden = false;
            if (item.drinking_only && (existing && existing.isDryDay)) isHidden = true;
            
            div.className = `${baseClass} ${isChecked ? checkedClass : uncheckedClass} ${isHidden ? 'hidden' : ''}`;

            div.onclick = () => {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
                
                if(cb.checked) {
                    div.className = `${baseClass} ${checkedClass} ${item.drinking_only ? 'drinking-only' : ''}`;
                    // ★重要: 飲酒項目をONにしたら休肝日はOFFにする
                    if (item.drinking_only) {
                        if (isDryCheck && isDryCheck.checked) {
                            isDryCheck.checked = false;
                            syncDryDayUI(false);
                        }
                    }
                } else {
                    div.className = `${baseClass} ${uncheckedClass} ${item.drinking_only ? 'drinking-only' : ''}`;
                }
            };

            div.innerHTML = `
                <span class="text-2xl">${item.icon}</span>
                <span class="text-[10px] font-bold leading-tight">${item.label}</span>
                <input type="checkbox" id="check-${item.id}" class="hidden" ${isChecked ? 'checked' : ''}>
            `;
            container.appendChild(div);
        });

        // 保存ボタンの状態
        const saveBtn = document.getElementById('btn-save-check');
        
        if (existing) {
            if (isDryCheck) isDryCheck.checked = existing.isDryDay;
            syncDryDayUI(existing.isDryDay);
            
            // 自動生成データ(weight: null)かどうかの判定
            if (saveBtn) {
                const isAutoGenerated = (existing.weight === null); 
                saveBtn.textContent = isAutoGenerated ? 'Save Check' : 'Update Check';
            }
        } else {
            if (isDryCheck) isDryCheck.checked = false;
            syncDryDayUI(false);
            if (saveBtn) saveBtn.textContent = 'Save Check';
        }

        // ★重要: ビール記録がある場合は休肝日を強制OFF・無効化
        if (beerLogsCount > 0) {
            if (isDryCheck) {
                isDryCheck.checked = false;
                isDryCheck.disabled = true;
            }
            syncDryDayUI(false); 
            
            if (dryLabelContainer) dryLabelContainer.classList.add('opacity-50', 'pointer-events-none');
            if (dryLabelText) dryLabelText.innerHTML = "Is today a Dry Day? <span class='text-[10px] text-red-500 font-bold ml-2'>(Alcohol Recorded)</span>";
        }

        toggleModal('check-modal', true);
    },

    // --- ライブラリ選択画面 ---
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
                        // スタイル切り替え
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

        // ライブラリ由来のIDセット
        const libraryIds = new Set();
        Object.values(CHECK_LIBRARY).flat().forEach(i => libraryIds.add(i.id));

        // カスタム項目（ライブラリにないもの）だけ抽出して維持
        const customItems = currentSchema.filter(item => !libraryIds.has(item.id));

        // プリセットIDからスキーマを構築
        const newSchemaFromLibrary = getActiveSchemaFromIds(selectedIds);
        
        // 結合
        const finalSchema = [...newSchemaFromLibrary, ...customItems];

        localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(finalSchema));
        
        // 開いているUIがあれば更新
        const modal = document.getElementById('check-library-modal');
        if(modal && !modal.classList.contains('hidden')) {
            CheckModal.openLibrary(); 
        }
        // 設定画面のリスト更新
        import('../Settings.js').then(m => m.Settings.renderCheckEditor());
        
        showMessage(`プリセット「${preset.label}」を適用しました`, 'success');
    },

    saveLibraryChanges: () => {
        const checkboxes = document.querySelectorAll('.library-check');
        const selectedIds = [];
        checkboxes.forEach(cb => {
            if (cb.checked) selectedIds.push(cb.value);
        });
        
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