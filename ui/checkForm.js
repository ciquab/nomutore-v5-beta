// ui/checkForm.js
// @ts-check

/**
 * 型定義
 * @typedef {import('../types.js').Check} Check
 * @typedef {import('../types.js').Log} Log
 * @typedef {import('../types.js').CheckSchemaItem} CheckSchemaItem
 */

import { APP, CHECK_LIBRARY, CHECK_PRESETS, CHECK_DEFAULT_IDS, getCheckItemSpec } from '../constants.js';
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


const METRIC_BADGE = {
    state: { label: '状態', className: 'bg-indigo-100 border dark:bg-indigo-900/35', borderColor: '#c7d2fe', textColor: '#4338ca' },
    action: { label: '行動', className: 'bg-emerald-100 border dark:bg-emerald-900/30', borderColor: '#a7f3d0', textColor: '#047857' },
    training: { label: '反応', className: 'bg-amber-100 border dark:bg-amber-900/35', borderColor: '#fde68a', textColor: '#b45309' }
};

let libraryMetricFilter = 'all';


const isCheckModalDebugEnabled = () => {
    try {
        return localStorage.getItem('nomutore_modal_debug') === '1' || window.__NOMUTORE_MODAL_DEBUG === true;
    } catch (_) {
        return window.__NOMUTORE_MODAL_DEBUG === true;
    }
};

const debugCheckModal = (stage, payload = {}) => {
    if (!isCheckModalDebugEnabled()) return;
    const entry = {
        ts: new Date().toISOString(),
        stage,
        ...payload
    };

    if (!Array.isArray(window.__checkModalDebugLog)) {
        window.__checkModalDebugLog = [];
    }
    window.__checkModalDebugLog.push(entry);
    if (window.__checkModalDebugLog.length > 200) {
        window.__checkModalDebugLog.splice(0, window.__checkModalDebugLog.length - 200);
    }

    console.warn('[CheckModalDebug]', entry);
};

const MAX_RENDER_CHECK_ITEMS = 80;
const MAX_SCAN_CHECK_ITEMS = 300;

/**
 * @param {any[]} rawSchema
 * @returns {CheckSchemaItem[]}
 */
const sanitizeCheckSchemaForRender = (rawSchema) => {
    if (!Array.isArray(rawSchema)) return [];

    /** @type {CheckSchemaItem[]} */
    const normalized = [];
    let truncated = false;

    const scanLimit = Math.min(rawSchema.length, MAX_SCAN_CHECK_ITEMS);

    for (let i = 0; i < scanLimit; i++) {
        if (normalized.length >= MAX_RENDER_CHECK_ITEMS) {
            truncated = true;
            break;
        }

        const item = rawSchema[i];
        if (!item || typeof item.id !== 'string' || typeof item.label !== 'string') continue;

        const id = String(item.id).trim();
        const label = String(item.label || '').slice(0, 40);
        if (!id || !label) continue;

        normalized.push({
            ...item,
            id,
            label,
            desc: typeof item.desc === 'string' ? item.desc.slice(0, 120) : '',
            icon: typeof item.icon === 'string' ? item.icon.slice(0, 80) : 'ph-duotone ph-check-circle'
        });
    }

    if (truncated) {
        debugCheckModal('schema:truncated', {
            limitedTo: MAX_RENDER_CHECK_ITEMS
        });
    }

    if (rawSchema.length > scanLimit) {
        debugCheckModal('schema:scan-truncated', {
            originalLength: rawSchema.length,
            scanLimit: MAX_SCAN_CHECK_ITEMS,
            kept: normalized.length
        });
    }

    return normalized;
};

/**
 * スキーマ項目から1行分のHTMLを安全に生成する
 * @param {CheckSchemaItem} item
 */
const buildCheckItemRow = (item) => {
    const spec = getCheckItemSpec(item.id);
    const iconDef = (spec && spec.icon) ? spec.icon : item.icon;
    let iconHtml = '';

    try {
        iconHtml = DOM.renderIcon(iconDef, 'text-xl text-indigo-500 dark:text-indigo-400');
    } catch (e) {
        debugCheckModal('schema:item-icon-error', {
            id: item.id,
            iconDef: typeof iconDef === 'string' ? iconDef : String(iconDef),
            message: e instanceof Error ? e.message : String(e)
        });
        iconHtml = '<i class="ph-duotone ph-check-circle text-xl text-indigo-500 dark:text-indigo-400"></i>';
    }

    return `
        <label class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer border border-transparent hover:border-indigo-200 dark:hover:border-indigo-700 transition h-full">
            <input type="checkbox" id="check-${item.id}" class="rounded text-brand focus:ring-indigo-500 w-5 h-5 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600">
            <div class="flex flex-col">
                <span class="text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1">
                    ${iconHtml} ${item.label}
                </span>
                ${item.desc ? `<span class="text-[11px] text-gray-500 dark:text-gray-400">${item.desc}</span>` : ''}
            </div>
        </label>
    `;
};



/**
 * @param {string | undefined} metricType
 */
const getMetricMeta = (metricType) => {
    const key = (metricType === 'state' || metricType === 'training') ? metricType : 'action';
    return METRIC_BADGE[key];
};

/**
 * @param {string | undefined} metricType
 */
const renderMetricBadge = (metricType) => {
    const meta = getMetricMeta(metricType);
    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-bold ${meta.className}" style="border-color:${meta.borderColor};color:${meta.textColor};">${meta.label}</span>`;
};
/* --- Action Handlers (ActionRouterから呼ばれる関数) --- */

/**
 * 日付変更時のハンドラ
 * @param {Event} e 
 */
export const handleCheckDateChange = (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    openCheckModal(input.value);
};

/**
 * 休肝日トグル変更時のハンドラ
 * @param {Event} e 
 */
export const handleDryDayToggle = (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    // UI同期
    syncDryDayUI(input.checked);
    // 音
    if (typeof Feedback !== 'undefined') Feedback.uiSwitch();
};

/**
 * ライブラリ項目の選択切り替えハンドラ
 * @param {string} id - 項目ID
 */
export const handleLibraryItemToggle = (id) => {
    const checkbox = /** @type {HTMLInputElement} */ (document.getElementById(`lib-chk-${id}`));
    if (!checkbox) return;

    // 状態反転
    checkbox.checked = !checkbox.checked;

    // 親要素(ボタン)のスタイル更新
    // ※ data-action="check:toggleLibraryItem" が付いている親要素を探す
    const btn = checkbox.closest('[data-action="check:toggleLibraryItem"]');
    if (btn) {
        btn.className = checkbox.checked
            ? 'p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 bg-indigo-50 border-indigo-500 dark:bg-indigo-900/30 dark:border-indigo-500'
            : 'p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300';
        
        const iconArea = btn.querySelector('.check-icon');
        if (iconArea) {
            iconArea.innerHTML = checkbox.checked 
                ? '<i class="ph-fill ph-check-circle text-indigo-500" aria-hidden="true"></i>' 
                : '<i class="ph-bold ph-circle text-gray-300" aria-hidden="true"></i>';
        }
    }
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
    const callId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    debugCheckModal('open:invoke', {
        callId,
        requestedDate: dateVal
    });

    // イベントループ停止の切り分け用プローブ
    Promise.resolve().then(() => {
        debugCheckModal('open:probe:microtask', { callId });
    });
    window.setTimeout(() => {
        debugCheckModal('open:probe:timeout0', { callId });
    }, 0);
    requestAnimationFrame(() => {
        debugCheckModal('open:probe:raf', { callId });
    });

    // 先にモーダル自体を表示して、データ取得待ちで「開かない」状態を防ぐ
    toggleModal('check-modal', true);

    const checkModalEl = document.getElementById('check-modal');
    const checkModalPanel = checkModalEl?.querySelector('[data-modal-content="true"]') || checkModalEl?.querySelector('div[class*="transform"]');
    debugCheckModal('open:start', {
        requestedDate: dateVal,
        hasModalEl: !!checkModalEl,
        hasModalPanel: !!checkModalPanel,
        modalClass: checkModalEl?.className || null,
        panelClass: checkModalPanel?.className || null
    });

    const openStartedAt = performance.now();
    const pendingTimer = window.setTimeout(() => {
        debugCheckModal('open:pending', {
            callId,
            requestedDate: dateVal,
            pendingMs: Math.round(performance.now() - openStartedAt)
        });
    }, 2500);

    let wEl = /** @type {HTMLInputElement | null} */ (null);
    let saveBtn = /** @type {HTMLElement | null} */ (null);
    let isDryInput = /** @type {HTMLInputElement | null} */ (null);
    let hint = /** @type {HTMLElement | null} */ (null);

    /**
     * @param {string} id
     * @param {boolean} val
     */
    const setCheck = (id, val) => {
        const el = /** @type {HTMLInputElement} */ (document.getElementById(id));
        if(el) el.checked = !!val;
    };

    try {

    const dateInput = /** @type {HTMLInputElement} */ (document.getElementById('check-date'));
    if(dateInput) {
        dateInput.value = dateVal;
        
        // 重複防止のため一度削除してから追加
        dateInput.removeEventListener('change', handleCheckDateChange);
        dateInput.addEventListener('change', handleCheckDateChange);
    }
    debugCheckModal('open:after-bind-date', { callId });

    // 日付表示バッジの更新
    const displayEl = document.getElementById('daily-check-date-display');
    const valueEl = /** @type {HTMLInputElement} */ (document.getElementById('daily-check-date-value'));
    if (displayEl) displayEl.textContent = d.format('MM/DD (ddd)');
    if (valueEl) valueEl.value = dateVal;
    
    const container = document.getElementById('check-items-container');
    if (container) {
        const renderStartedAt = performance.now();
        container.innerHTML = '';
        const schema = getStoredSchema();
        debugCheckModal('schema:loaded', {
            callId,
            rawCount: Array.isArray(schema) ? schema.length : null
        });
        const safeSchema = sanitizeCheckSchemaForRender(schema);

        safeSchema.forEach(item => {
            const div = document.createElement('div');
            const visibilityClass = item.drinking_only ? 'drinking-only' : '';
            if (visibilityClass) div.className = visibilityClass;

            try {
                div.innerHTML = buildCheckItemRow(item);
            } catch (e) {
                debugCheckModal('schema:item-render-error', {
                    callId,
                    id: item.id,
                    message: e instanceof Error ? e.message : String(e)
                });
                div.innerHTML = `
                    <label class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-700">
                        <input type="checkbox" id="check-${item.id}" class="rounded text-brand focus:ring-indigo-500 w-5 h-5 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                        <div class="flex flex-col">
                            <span class="text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1">
                                <i class="ph-duotone ph-check-circle text-xl text-indigo-500 dark:text-indigo-400"></i> ${item.label}
                            </span>
                            <span class="text-[11px] text-red-500">項目描画を簡易表示に切替</span>
                        </div>
                    </label>
                `;
            }

            container.appendChild(div);
        });

        await new Promise((resolve) => setTimeout(resolve, 0));
        debugCheckModal('schema:yielded', {
            callId,
            count: safeSchema.length
        });

        debugCheckModal('schema:rendered', {
            callId,
            count: safeSchema.length,
            durationMs: Math.round(performance.now() - renderStartedAt)
        });
    }
    debugCheckModal('open:after-schema', { callId });

    const isDryCheck = document.getElementById('check-is-dry');
    if (isDryCheck) {
        isDryCheck.removeEventListener('change', handleDryDayToggle);
        isDryCheck.addEventListener('change', handleDryDayToggle);
    }

    // Reset to initial state
    setCheck('check-is-dry', false);
    syncDryDayUI(false);
    
    wEl = /** @type {HTMLInputElement} */ (document.getElementById('check-weight'));
    if(wEl) wEl.value = '';

    saveBtn = document.getElementById('btn-save-check');
    if (saveBtn) saveBtn.textContent = '記録する';

    isDryInput = /** @type {HTMLInputElement} */ (document.getElementById('check-is-dry'));
    const dryLabelContainer = isDryInput ? isDryInput.closest('#drinking-section') : null;
    const dryLabelText = dryLabelContainer ? dryLabelContainer.querySelector('span.font-bold') : null;
    hint = /** @type {HTMLElement|null} */ (document.querySelector('#drinking-section p'));

    // ラベルを日本語化
    if (dryLabelText) dryLabelText.innerHTML = "休肝日";
    
    // ★修正: 状態を強力にリセット（前の日付の状態を完全に消す）
    if (isDryInput) isDryInput.disabled = false;
    if (dryLabelContainer) dryLabelContainer.classList.remove('opacity-50', 'pointer-events-none');
    
    if (hint) {
        // ★修正: classNameを直接上書きして、前の状態を完全にリセットする
        hint.textContent = '一滴も飲まなかった日はスイッチON'; 
        hint.className = 'text-[11px] text-orange-600/70'; 
    }

    // UI同期（初期状態として呼ぶ）
    syncDryDayUI(false);


    // UI同期（初期状態として呼ぶ）
    syncDryDayUI(false);
    debugCheckModal('open:after-reset', { callId });

    } catch (e) {
        window.clearTimeout(pendingTimer);
        debugCheckModal('open:preload-error', {
            callId,
            requestedDate: dateVal,
            message: e instanceof Error ? e.message : String(e)
        });
        console.error('Check modal preload failed:', e);
        return;
    }

    try {
        // ✅ Service.getCheckStatusForDate を利用してロジックを隠蔽
        // 取得がハングした場合でも UI が固まらないようにタイムアウト保険を入れる
        const checkStatus = await Promise.race([
            Service.getCheckStatusForDate(d.valueOf()),
            new Promise((_, reject) => window.setTimeout(() => reject(new Error('check-status-timeout')), 4000))
        ]);

        // @ts-ignore Promise.race の型簡略化のため
        const { check: anyRecord, hasBeer } = checkStatus;

        if (anyRecord) {
            setCheck('check-is-dry', !!anyRecord.isDryDay);
            syncDryDayUI(!!anyRecord.isDryDay);
            
            const schema = Service.getCheckSchema();

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
                    const labelText = spec?.label || key;

                    const div = document.createElement('div');
                    div.className = "legacy-item-wrapper";
                    div.innerHTML = `
                        <label class="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700 opacity-80 cursor-not-allowed">
                            <input type="checkbox" checked disabled class="rounded text-amber-500 w-5 h-5 bg-white dark:bg-gray-700 border-gray-300">
                            <div class="flex flex-col">
                                <span class="text-xs font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1">
                                    ${iconHtml} ${labelText}
                                    <span class="text-[11px] bg-amber-200 dark:bg-amber-800 px-1 rounded text-amber-900 dark:text-amber-100 ml-1">Legacy</span>
                                </span>
                                <span class="text-[11px] text-amber-600/70 dark:text-amber-400/70">現在はリストにありません</span>
                            </div>
                        </label>
                    `;
                    container.appendChild(div);
                }
            });

            if(wEl) wEl.value = String(anyRecord.weight || '');

            if (saveBtn) {
                saveBtn.textContent = anyRecord.isSaved ? '更新する' : '記録する';
            }
        }

        if (hasBeer) {
            setCheck('check-is-dry', false); 
            syncDryDayUI(false); // falseで同期
            
            // 強制的にUIをロック状態へ上書き
            if (isDryInput) isDryInput.disabled = true;
            if (hint) {
                hint.innerHTML = "<i class='ph-bold ph-beer-bottle'></i> 飲酒記録があるため、休肝日は選択できません";
                // 赤字エラー表示
                hint.className = 'text-[11px] font-bold text-red-500';
            }
        }

        const modalStyle = checkModalEl ? window.getComputedStyle(checkModalEl) : null;
        const panelStyle = checkModalPanel ? window.getComputedStyle(checkModalPanel) : null;
        debugCheckModal('open:ready', {
            callId,
            requestedDate: dateVal,
            hasRecord: !!anyRecord,
            hasBeer,
            modalDisplay: modalStyle?.display || null,
            modalOpacity: modalStyle?.opacity || null,
            panelOpacity: panelStyle?.opacity || null,
            panelTransform: panelStyle?.transform || null
        });


    } catch (e) { 
        debugCheckModal('open:error', {
            callId,
            requestedDate: dateVal,
            message: e instanceof Error ? e.message : String(e)
        });
        if (e instanceof Error && e.message === 'check-status-timeout') {
            // 画面操作不能に見える状態を避けるため、最低限開いたまま使える状態を維持
            showMessage('デイリーチェックの読込が遅延しています。再度お試しください。', 'error');
        }
        console.error("Failed to fetch check data:", e); 
    } finally {
        window.clearTimeout(pendingTimer);
        debugCheckModal('open:finally', {
            callId,
            requestedDate: dateVal,
            elapsedMs: Math.round(performance.now() - openStartedAt)
        });
    }

};

/* --- Check Library Logic (Phase 1.5 New) --- */

/**
 * IDリストからアクティブなスキーマオブジェクトを生成する
 * @param {string[]} ids 
 * @returns {CheckSchemaItem[]}
 */
const getActiveSchemaFromIds = (ids) => {
    return Service.resolveCheckSchemaItemsByIds(ids);
};

/**
 * 現在のスキーマID一覧を取得
 * @returns {string[]}
 */
const getCurrentActiveIds = () => Service.getCurrentCheckSchemaIds();

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

    const filterWrap = document.createElement('div');
    filterWrap.className = 'mb-3 flex flex-wrap gap-2';
    const metricFilters = [
        { key: 'all', label: 'すべて' },
        { key: 'state', label: '状態' },
        { key: 'action', label: '行動' },
        { key: 'training', label: '反応' }
    ];

    metricFilters.forEach(f => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = libraryMetricFilter === f.key;
        btn.className = isActive
            ? 'px-2.5 py-1 rounded-full text-[11px] font-bold border border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
            : 'px-2.5 py-1 rounded-full text-[11px] font-bold border border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-300';
        btn.textContent = f.label;
        btn.addEventListener('click', () => {
            libraryMetricFilter = f.key;
            renderCheckLibrary();
        });
        filterWrap.appendChild(btn);
    });

    container.appendChild(filterWrap);

    Object.entries(categories).forEach(([key, label]) => {
        const items = CHECK_LIBRARY[key];
        if (!items) return;

        const filteredItems = items.filter(item => libraryMetricFilter === 'all' || (item.metricType || 'action') === libraryMetricFilter);
        if (filteredItems.length === 0) return;

        const section = document.createElement('div');
        section.className = 'mb-4';
        section.innerHTML = `<h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 sticky top-0 bg-white dark:bg-base-900 py-2 z-10">${label}</h4>`;

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2';

        filteredItems.forEach(item => {
            const isActive = activeIds.has(item.id);
            const btn = document.createElement('div');
            btn.dataset.action = 'check:toggleLibraryItem';
            btn.dataset.args = JSON.stringify({ id: item.id });
            btn.className = `p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 ${
                isActive
                ? 'bg-indigo-50 border-indigo-500 dark:bg-indigo-900/30 dark:border-indigo-500'
                : 'bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300'
            }`;

            const iconHtml = DOM.renderIcon(item.icon, 'text-2xl text-gray-600 dark:text-gray-300');
            const badgeHtml = renderMetricBadge(item.metricType);

            btn.innerHTML = `
                <input type="checkbox" id="lib-chk-${item.id}" class="hidden" ${isActive ? 'checked' : ''} value="${item.id}">
                ${iconHtml}
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-0.5">
                        <p class="text-xs font-bold text-base-900 dark:text-white truncate">${item.label}</p>
                        ${badgeHtml}
                    </div>
                    <p class="text-[11px] text-gray-500 dark:text-gray-400 truncate">${item.desc}</p>
                </div>
                <div class="check-icon">
                    ${isActive ? '<i class="ph-fill ph-check-circle text-indigo-500" aria-hidden="true"></i>' : '<i class="ph-bold ph-circle text-gray-300" aria-hidden="true"></i>'}
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
    
    Service.applyCheckLibrarySelection(selectedIds);
    
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
    
    Service.applyCheckLibrarySelection(selectedIds);
    
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
    
    let schema = Service.getCheckSchema();
    if (schema.length === 0) {
        schema = getActiveSchemaFromIds(CHECK_DEFAULT_IDS);
        Service.setCheckSchema(schema);
    }

    schema.forEach((/** @type {CheckSchemaItem} */ item, index) => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl mb-2";
        
        const deleteBtn = `<button data-action="check:deleteItem" data-args='{"index":${index}}' class="text-red-500 hover:bg-red-100 p-1 rounded"><i class="ph-bold ph-trash" aria-hidden="true"></i></button>`;

        const iconHtml = DOM.renderIcon(item.icon, 'text-xl text-gray-500');

        const badgeHtml = renderMetricBadge(item.metricType);

        div.innerHTML = `
            <div class="flex items-center gap-3">
                ${iconHtml}
                <div>
                    <div class="flex items-center gap-1.5">
                        <p class="text-xs font-bold text-gray-800 dark:text-gray-200">${item.label}</p>
                        ${badgeHtml}
                    </div>
                    <p class="text-[11px] text-gray-500 dark:text-gray-400">${item.desc || ''} ${item.drinking_only ? '<span class="text-orange-500">(Drink Only)</span>' : ''}</p>
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
    const schema = Service.getCheckSchema();
    schema.splice(index, 1);
    Service.setCheckSchema(schema);
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

    const metricTypeInput = prompt(
        '分析カテゴリを入力してください\n\n' +
        'state: 状態（体調・結果）\n' +
        'action: 行動（実施したこと）\n' +
        'training: トレーニング反応\n\n' +
        '※ 未入力や不正値は action になります',
        'action'
    );

    const metricTypeRaw = (metricTypeInput || 'action').toLowerCase().trim();
    const allowedMetricTypes = new Set(['state', 'action', 'training']);
    const metricType = allowedMetricTypes.has(metricTypeRaw) ? metricTypeRaw : 'action';


    const drinkingOnly = confirm('「お酒を飲んだ日」だけ表示しますか？\n(OK=はい / キャンセル=いいえ[毎日表示])');

    const id = `custom_${Date.now()}`;
    
    const newItem = {
        id, 
        label, 
        icon: iconClass,
        type: 'boolean', 
        desc,
        metricType,
        drinking_only: drinkingOnly
    };

    const schema = Service.getCheckSchema();
    schema.push(newItem);
    Service.setCheckSchema(schema);
    
    renderCheckEditor();
};

// --- 内部ヘルパー関数群 ---

/**
 * 保存されたスキーマを取得
 * @returns {CheckSchemaItem[]}
 */
const getStoredSchema = () => {
    // NOTE:
    // `open:start` 直後で停止する事象が継続しているため、モーダル表示経路では
    // localStorage由来の同期読み込み/パースを一旦使わず、既定スキーマで即時描画する。
    // まず「モーダルが必ず開く」ことを優先し、復旧後に段階的に再導入する。
    debugCheckModal('schema:forced-defaults', {
        reason: 'avoid-sync-storage-stall-on-open'
    });
    return Service.resolveCheckSchemaItemsByIds(CHECK_DEFAULT_IDS);
};

/**
 * 休肝日UIの同期
 * @param {boolean} isDry 
 */
export const syncDryDayUI = (isDry) => {
    const items = document.querySelectorAll('.drinking-only');
    items.forEach(el => el.classList.toggle('hidden', isDry));

    // メッセージと色を動的に切り替え
    const hint = document.querySelector('#drinking-section p');
    // 飲酒記録ありで無効化されている場合はメッセージを上書きしない
    const isDisabled = document.getElementById('check-is-dry')?.disabled;

    if (hint && !isDisabled) {
        if (isDry) {
            hint.innerHTML = "<i class='ph-fill ph-heart text-emerald-500'></i> 素晴らしい！肝臓が回復しています";
            hint.className = "text-[11px] font-bold text-emerald-600";
        } else {
            hint.textContent = '一滴も飲まなかった日はスイッチON';
            hint.className = "text-[11px] text-orange-600/70";
        }
    }
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
            return null;
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
