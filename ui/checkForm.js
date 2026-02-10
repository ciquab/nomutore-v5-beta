// ui/checkForm.js
// @ts-check

/**
 * 型定義
 * @typedef {import('../types.js').Check} Check
 * @typedef {import('../types.js').Log} Log
 * @typedef {import('../types.js').CheckSchemaItem} CheckSchemaItem
 */

import { CHECK_SCHEMA, APP, CHECK_LIBRARY, CHECK_PRESETS, CHECK_DEFAULT_IDS, getCheckItemSpec } from '../constants.js';
import { getVirtualDate } from '../logic.js';
import { Service } from '../service.js';       
import { DOM, toggleModal, showMessage, Feedback } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

const ICON_KEYWORDS = {
    'gym': 'ph-duotone ph-barbell',
    'run': 'ph-duotone ph-sneaker-move',
    'walk': 'ph-duotone ph-footprints',
    'sleep': 'ph-duotone ph-moon-stars',
    'food': 'ph-duotone ph-bowl-food',
    'drink': 'ph-duotone ph-beer-bottle',
    'water': 'ph-duotone ph-drop',
    'heart': 'ph-duotone ph-heart',
    'star': 'ph-duotone ph-star',
    'fire': 'ph-duotone ph-fire',
    'bath': 'ph-duotone ph-drop-half-bottom', // サウナ/風呂代用
    'book': 'ph-duotone ph-book-open',
    'work': 'ph-duotone ph-briefcase'
};

/* --- Check Modal Logic --- */

/**
 * デイリーチェックモーダルを開く
 * @param {string|null} [dateStr=null] - 指定日付 (YYYY-MM-DD)
 */
export const openCheckModal = async (dateStr = null) => {
    const targetDate = dateStr || getVirtualDate();
    const d = dayjs(targetDate);
    const dateVal = d.format('YYYY-MM-DD');
    const dateInput = /** @type {HTMLInputElement} */ (document.getElementById('check-date'));
    if(dateInput) dateInput.value = dateVal;

    // 日付表示バッジの更新
    const displayEl = document.getElementById('daily-check-date-display');
    const valueEl = /** @type {HTMLInputElement} */ (document.getElementById('daily-check-date-value'));
    if (displayEl) displayEl.textContent = d.format('MM/DD (ddd)');
    if (valueEl) valueEl.value = dateVal;
    
    const container = document.getElementById('check-items-container');
    if (container) {
        container.innerHTML = '';
        const schema = getStoredSchema();

        schema.forEach(item => {
            const div = document.createElement('div');
            const visibilityClass = item.drinking_only ? 'drinking-only' : '';
            if (visibilityClass) div.className = visibilityClass;
            
            // マスタデータからアイコン取得
            const spec = getCheckItemSpec(item.id);
            const iconDef = (spec && spec.icon) ? spec.icon : item.icon;
            const iconHtml = DOM.renderIcon(iconDef, 'text-xl text-indigo-500 dark:text-indigo-400');

            div.innerHTML = `
                <label class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer border border-transparent hover:border-indigo-200 dark:hover:border-indigo-700 transition h-full">
                    <input type="checkbox" id="check-${item.id}" class="rounded text-indigo-600 focus:ring-indigo-500 w-5 h-5 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                    <div class="flex flex-col">
                        <span class="text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1">
                            ${iconHtml} ${item.label}
                        </span>
                        ${item.desc ? `<span class="text-[9px] text-gray-400">${item.desc}</span>` : ''}
                    </div>
                </label>
            `;
            container.appendChild(div);
        });
    }

    const isDryCheck = document.getElementById('check-is-dry');
    if (isDryCheck) {
        isDryCheck.onchange = (e) => syncDryDayUI(/** @type {HTMLInputElement} */(e.target).checked);
    }

    /**
     * @param {string} id
     * @param {boolean} val
     */
    const setCheck = (id, val) => {
        const el = /** @type {HTMLInputElement} */ (document.getElementById(id));
        if(el) el.checked = !!val;
    };
    
    // Reset to initial state
    setCheck('check-is-dry', false);
    syncDryDayUI(false);
    
    const wEl = /** @type {HTMLInputElement} */ (document.getElementById('check-weight'));
    if(wEl) wEl.value = '';

    const saveBtn = document.getElementById('btn-save-check');
    if (saveBtn) saveBtn.textContent = 'Log Check';

    const isDryInput = /** @type {HTMLInputElement} */ (document.getElementById('check-is-dry'));
    const dryLabelContainer = isDryInput ? isDryInput.closest('#drinking-section') : null;
    const dryLabelText = dryLabelContainer ? dryLabelContainer.querySelector('span.font-bold') : null;
    const hint = document.querySelector('#drinking-section p');

    // ラベルを日本語化
    if (dryLabelText) dryLabelText.innerHTML = "休肝日 <span class='text-xs opacity-70 font-normal ml-1'>(No Alcohol)</span>";
    if (isDryInput) isDryInput.disabled = false;
    // 以前の状態をリセット
    if (dryLabelContainer) dryLabelContainer.classList.remove('opacity-50', 'pointer-events-none');
    if (hint) {
        hint.classList.remove('text-red-500', 'font-bold');
    }

    try {
        // ✅ Service.getCheckStatusForDate を利用してロジックを隠蔽
        const { check: anyRecord, hasBeer } = await Service.getCheckStatusForDate(d.valueOf());

        if (anyRecord) {
            setCheck('check-is-dry', !!anyRecord.isDryDay);
            syncDryDayUI(!!anyRecord.isDryDay);
            
            let schema = CHECK_SCHEMA;
            try {
                const s = localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA);
                if (s) schema = JSON.parse(s);
            } catch(e) {}

            const renderedIds = new Set(['id', 'timestamp', 'isDryDay', 'weight', 'isSaved', 'date']);
            schema.forEach(item => {
                // ✅ Check型にIndex Signatureが入ったため、@ts-ignore 不要
                if (anyRecord[item.id] !== undefined) {
                    // @ts-ignore
                    setCheck(`check-${item.id}`, anyRecord[item.id]);
                }
                renderedIds.add(item.id);
            });

            // Legacy Item Recovery
            const container = document.getElementById('check-items-container');
            const legacyKeys = Object.keys(anyRecord).filter(key => !renderedIds.has(key));

            legacyKeys.forEach(key => {
                // ✅ Check型のおかげで、ここも安全にアクセス可能
                if (anyRecord[key] === true && container) {
                    const spec = getCheckItemSpec(key);
                    const iconHtml = DOM.renderIcon(spec?.icon || 'ph-bold ph-clock-counter-clockwise', 'text-lg text-amber-500');

                    const div = document.createElement('div');
                    div.className = "legacy-item-wrapper";
                    div.innerHTML = `
                        <label class="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700 opacity-80 cursor-not-allowed">
                            <input type="checkbox" checked disabled class="rounded text-amber-500 w-5 h-5 bg-white dark:bg-gray-700 border-gray-300">
                            <div class="flex flex-col">
                                <span class="text-xs font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1">
                                    ${iconHtml} ${spec.label}
                                    <span class="text-[9px] bg-amber-200 dark:bg-amber-800 px-1 rounded text-amber-900 dark:text-amber-100 ml-1">Legacy</span>
                                </span>
                                <span class="text-[9px] text-amber-600/70 dark:text-amber-400/70">現在はリストにありません</span>
                            </div>
                        </label>
                    `;
                    container.appendChild(div);
                }
            });

            if(wEl) wEl.value = String(anyRecord.weight || '');

            if (saveBtn) {
                saveBtn.textContent = anyRecord.isSaved ? 'Update Check' : 'Log Check';
            }
        }

        if (hasBeer) {
            setCheck('check-is-dry', false); 
            syncDryDayUI(false);              
            if (isDryInput) isDryInput.disabled = true;
            if (hint) {
                hint.innerHTML = "<i class='ph-bold ph-beer-bottle'></i> 飲酒記録があるため、休肝日は選択できません";
                hint.classList.remove('text-orange-600/70', 'text-emerald-600');
                hint.classList.add('text-red-500', 'font-bold');
            }
        }
    } catch (e) { 
        console.error("Failed to fetch check data:", e); 
    }

    toggleModal('check-modal', true);
};

/* --- Check Library Logic (Phase 1.5 New) --- */

/**
 * IDリストからアクティブなスキーマオブジェクトを生成する
 * @param {string[]} ids 
 * @returns {CheckSchemaItem[]}
 */
const getActiveSchemaFromIds = (ids) => {
    /** @type {CheckSchemaItem[]} */
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
                item = current.find(/** @param {CheckSchemaItem} i */ i => i.id === id);
            } catch(e){}
        }

        if (item) {
            activeSchema.push(item);
        }
    });
    return activeSchema;
};

/**
 * 現在のスキーマID一覧を取得
 * @returns {string[]}
 */
const getCurrentActiveIds = () => {
    try {
        const schema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
        return schema.map(/** @param {CheckSchemaItem} i */ i => i.id);
    } catch(e) {
        return CHECK_DEFAULT_IDS;
    }
};

/**
 * チェック項目ライブラリ画面を描画
 */
export const renderCheckLibrary = () => {
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
            
            btn.addEventListener('click', () => {
                const checkbox = /** @type {HTMLInputElement} */ (document.getElementById(`lib-chk-${item.id}`));
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    btn.className = checkbox.checked
                        ? 'p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 bg-indigo-50 border-indigo-500 dark:bg-indigo-900/30 dark:border-indigo-500'
                        : 'p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300';
                    
                    const iconArea = btn.querySelector('.check-icon');
                    if (iconArea) {
                        iconArea.innerHTML = checkbox.checked 
                            ? '<i class="ph-fill ph-check-circle text-indigo-500"></i>' 
                            : '<i class="ph-bold ph-circle text-gray-300"></i>';
                    }
                }
            });

            const iconHtml = DOM.renderIcon(item.icon, 'text-2xl text-gray-600 dark:text-gray-300');

            btn.innerHTML = `
                <input type="checkbox" id="lib-chk-${item.id}" class="hidden" ${isActive ? 'checked' : ''} value="${item.id}">
                ${iconHtml}
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-base-900 dark:text-white truncate">${item.label}</p>
                    <p class="text-[9px] text-gray-400 truncate">${item.desc}</p>
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
};

/**
 * ライブラリ変更を適用
 */
export const applyLibraryChanges = () => {
    const checkedInputs = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('#library-content input[type="checkbox"]:checked'));
    const selectedIds = Array.from(checkedInputs).map(input => input.value);
    
    let currentSchema = [];
    try {
        currentSchema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
    } catch(e){}

    const libraryIds = new Set();
    Object.values(CHECK_LIBRARY).flat().forEach(i => libraryIds.add(i.id));

    const customItems = currentSchema.filter(/** @param {CheckSchemaItem} item */ item => !libraryIds.has(item.id));

    const newSchemaFromLibrary = getActiveSchemaFromIds(selectedIds);
    const finalSchema = [...newSchemaFromLibrary, ...customItems];

    localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(finalSchema));
    
    toggleModal('check-library-modal', false);
    renderCheckEditor(); 
    showMessage('チェック項目を更新しました', 'success');
};

/**
 * プリセット適用
 * @param {string} presetKey 
 */
export const applyPreset = (presetKey) => {
    const preset = CHECK_PRESETS[presetKey];
    if (!preset) return;

    if (!confirm(`「${preset.label}」プリセットを適用しますか？\n（現在のカスタム項目は維持されますが、ライブラリ選択項目は上書きされます）`)) return;

    const selectedIds = preset.ids;
    
    let currentSchema = [];
    try {
        currentSchema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
    } catch(e){}
    const libraryIds = new Set();
    Object.values(CHECK_LIBRARY).flat().forEach(i => libraryIds.add(i.id));
    const customItems = currentSchema.filter(/** @param {CheckSchemaItem} item */ item => !libraryIds.has(item.id));

    const newSchemaFromLibrary = getActiveSchemaFromIds(selectedIds);
    const finalSchema = [...newSchemaFromLibrary, ...customItems];

    localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(finalSchema));
    
    const modal = document.getElementById('check-library-modal');
    if(modal && !modal.classList.contains('hidden')) {
        renderCheckLibrary();
    }
    
    renderCheckEditor();
    showMessage(`プリセット「${preset.label}」を適用しました`, 'success');
};

/**
 * ライブラリモーダルを開く
 */
export const openCheckLibrary = () => {
    renderCheckLibrary();
    toggleModal('check-library-modal', true);
};

/**
 * エディタ画面を描画
 */
export const renderCheckEditor = () => {
    const container = document.getElementById('check-editor-list');
    if (!container) return; 
    container.innerHTML = '';
    
    let schema = [];
    try {
        schema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]');
        if (schema.length === 0) {
            schema = getActiveSchemaFromIds(CHECK_DEFAULT_IDS);
            localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(schema));
        }
    } catch(e) {}

    schema.forEach((/** @type {CheckSchemaItem} */ item, index) => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl mb-2";
        
        const deleteBtn = `<button data-action="check:deleteItem" data-args='{"index":${index}}' class="text-red-500 hover:bg-red-100 p-1 rounded"><i class="ph-bold ph-trash"></i></button>`;

        const iconHtml = DOM.renderIcon(item.icon, 'text-xl text-gray-500');

        div.innerHTML = `
            <div class="flex items-center gap-3">
                ${iconHtml}
                <div>
                    <p class="text-xs font-bold text-gray-800 dark:text-gray-200">${item.label}</p>
                    <p class="text-[10px] text-gray-400">${item.desc || ''} ${item.drinking_only ? '<span class="text-orange-500">(Drink Only)</span>' : ''}</p>
                </div>
            </div>
            ${deleteBtn}
        `;
        container.appendChild(div);
    });
};

/**
 * 項目削除
 * @param {number} index 
 */
export const deleteCheckItem = (index) => {
    if(!confirm('この項目を削除しますか？')) return;
    let schema = [];
    try { schema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]'); } catch(e) {}
    schema.splice(index, 1);
    localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(schema));
    renderCheckEditor();
};

/**
 * 新規項目追加
 */
export const addNewCheckItem = () => {
    const label = prompt('項目名を入力してください (例: 筋トレ)');
    if (!label) return;

    const iconInput = prompt(
        'アイコン用の「絵文字」または「キーワード」を入力してください\n\n' + 
        '📝 絵文字: 🧖, 💪, 💊 ...\n' +
        '🔑 キーワード: gym, run, sleep, water, fire ...', 
        ''
    );

    let iconClass = 'ph-duotone ph-check-circle';
    
    if (iconInput) {
        const lowerKey = iconInput.toLowerCase().trim();
        if (ICON_KEYWORDS[lowerKey]) {
            iconClass = ICON_KEYWORDS[lowerKey];
        } else {
            iconClass = iconInput;
        }
    }

    const descInput = prompt('説明を入力してください (例: 30分以上やった)', '');
    const desc = descInput || ''; 

    const drinkingOnly = confirm('「お酒を飲んだ日」だけ表示しますか？\n(OK=はい / キャンセル=いいえ[毎日表示])');

    const id = `custom_${Date.now()}`;
    
    const newItem = {
        id, 
        label, 
        icon: iconClass,
        type: 'boolean', 
        desc, 
        drinking_only: drinkingOnly
    };

    let schema = [];
    try { schema = JSON.parse(localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA) || '[]'); } catch(e) {}
    schema.push(newItem);
    localStorage.setItem(APP.STORAGE_KEYS.CHECK_SCHEMA, JSON.stringify(schema));
    
    renderCheckEditor();
};

// --- 内部ヘルパー関数群 ---

/**
 * 保存されたスキーマを取得
 * @returns {CheckSchemaItem[]}
 */
const getStoredSchema = () => {
    try {
        const stored = localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA);
        return stored ? JSON.parse(stored) : getActiveSchemaFromIds(CHECK_DEFAULT_IDS);
    } catch(e) {
        return getActiveSchemaFromIds(CHECK_DEFAULT_IDS);
    }
};

/**
 * 休肝日UIの同期
 * @param {boolean} isDry 
 */
export const syncDryDayUI = (isDry) => {
    const items = document.querySelectorAll('.drinking-only');
    items.forEach(el => el.classList.toggle('hidden', isDry));
};

/**
 * デイリーチェックの入力内容を収集してオブジェクトで返す
 * ✅ timestampを追加して完全なCheck型として返す
 * @returns {Check} 収集されたチェックデータ
 */
export const getCheckFormData = () => {
    const dateInput = /** @type {HTMLInputElement} */ (document.getElementById('check-date'));
    const isDryInput = /** @type {HTMLInputElement} */ (document.getElementById('check-is-dry'));
    const weightInput = /** @type {HTMLInputElement} */ (document.getElementById('check-weight'));

    const dateVal = dateInput?.value || getVirtualDate();
    const isDryDay = isDryInput?.checked || false;
    const weight = weightInput?.value || '';

    // ★追加: 体重のバリデーション (数値チェックと範囲制限)
    if (weight !== '') {
        const w = parseFloat(weight);
        if (isNaN(w) || w < 20 || w > 500) {
            showMessage('体重を正しく入力してください (20kg - 500kg)', 'error');
            throw new Error('Invalid weight');
        }
    }
    
    // ✅ timestamp をここで計算（Check型の必須プロパティ）
    const timestamp = dayjs(dateVal).startOf('day').add(12, 'hour').valueOf();

    const schema = getStoredSchema();

    /** @type {Check} */
    const data = {
        date: dateVal,
        timestamp, // ✅ 必須
        isDryDay,
        weight,
        isSaved: true
    };

    // 各項目のチェック状態をIDをキーにして格納
    schema.forEach(item => {
        const el = /** @type {HTMLInputElement} */ (document.getElementById(`check-${item.id}`));
        // ✅ Index Signature が types.js にあれば @ts-ignore は不要
        data[item.id] = el ? el.checked : false;
    });

    return data;
};


