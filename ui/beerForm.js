// ui/beerForm.js
// @ts-check

/**
 * 型定義のインポート
 * @typedef {import('../types.js').Log} Log
 */

import { STYLE_SPECS, SIZE_DATA, CALORIES, STYLE_METADATA, APP, FLAVOR_AXES } from '../constants.js';
import { Calc, getVirtualDate } from '../logic.js';
import { LogService } from '../logService.js'; // ✅ LogServiceを利用
import { showMessage, Feedback, toggleModal } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/* --- Beer Modal Logic --- */

/**
 * ビール入力モーダルを開く
 * @param {Event} e - トリガーイベント
 * @param {string|null} [dateStr=null] - 指定日付 (YYYY-MM-DD)
 * @param {Log|null} [log=null] - 編集対象のログデータ
 */
export const openBeerModal = (e, dateStr = null, log = null) => {
    // 1. リセット処理
    resetBeerForm(true); 

    // 2. 日付の決定
    let targetDate;
    if (log) {
        targetDate = dayjs(log.timestamp).format('YYYY-MM-DD');
    } else {
        targetDate = dayjs(dateStr || getVirtualDate()).format('YYYY-MM-DD');
    }

    const dateInput = /** @type {HTMLInputElement} */ (document.getElementById('beer-date'));
    if (dateInput) {
        dateInput.value = targetDate;
        console.log(`[BeerForm] Target date set to: ${targetDate}`); 
    }

    updateBeerSelectOptions();

    const abvInput = /** @type {HTMLInputElement} */ (document.getElementById('preset-abv'));
    updateInputSuggestions(); // 予測変換リスト更新

    if (log) {
        const idField = /** @type {HTMLInputElement} */ (document.getElementById('editing-log-id'));
        if(idField) idField.value = String(log.id);
        
        /** @type {HTMLInputElement} */(document.getElementById('beer-count')).value = String(log.count || 1);
        /** @type {HTMLInputElement} */(document.getElementById('beer-brewery')).value = log.brewery || '';
        /** @type {HTMLInputElement} */(document.getElementById('beer-brand')).value = log.brand || log.name || ''; 
        /** @type {HTMLInputElement} */(document.getElementById('beer-rating')).value = String(log.rating || 0);
        /** @type {HTMLTextAreaElement} */(document.getElementById('beer-memo')).value = log.memo || '';
        
        if (log.isCustom) {
            switchBeerInputTab('custom');
            /** @type {HTMLInputElement} */(document.getElementById('custom-abv')).value = String(log.abv || 5.0);
            const storedAmount = Number.isFinite(log.rawAmount) && (log.rawAmount || 0) > 0
                ? log.rawAmount
                : log.ml;
            const mlVal = (Number.isFinite(storedAmount) && (storedAmount || 0) > 0) ? storedAmount : 350;
            /** @type {HTMLInputElement} */(document.getElementById('custom-amount')).value = String(mlVal);
            
            if (log.customType) {
                const radio = /** @type {HTMLInputElement} */ (document.querySelector(`input[name="customType"][value="${log.customType}"]`));
                if (radio) radio.checked = true;
            }
        } else {
            switchBeerInputTab('preset');
            const styleSel = /** @type {HTMLSelectElement} */ (document.getElementById('beer-select'));
            const sizeSel = /** @type {HTMLSelectElement} */ (document.getElementById('beer-size'));
            if (log.style) styleSel.value = log.style;
            if (log.size) sizeSel.value = String(log.size);
            
            const spec = STYLE_SPECS[log.style || ''];
            if (spec && log.abv !== undefined && log.abv !== spec.abv) {
                if (abvInput) abvInput.value = String(log.abv);
            }
        }
    }
    
    // --- イベントリスナーの登録 ---
    const monitorIds = ['beer-select', 'beer-size', 'beer-count', 'preset-abv', 'custom-abv', 'custom-amount'];
    monitorIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.oninput = updateBeerKcalPreview;
            el.onchange = updateBeerKcalPreview;
        }
    });

    document.querySelectorAll('input[name="customType"]').forEach(radio => {
        // @ts-ignore
        radio.onchange = updateBeerKcalPreview;
    });

    const styleSel = /** @type {HTMLSelectElement} */ (document.getElementById('beer-select'));
    if (styleSel && abvInput) {
        styleSel.onchange = () => {
            updateBeerKcalPreview(); 
            const spec = STYLE_SPECS[styleSel.value];
            if (spec && abvInput) abvInput.placeholder = String(spec.abv);
        };
        const initialSpec = STYLE_SPECS[styleSel.value];
        if (initialSpec) abvInput.placeholder = String(initialSpec.abv);
    }

    // 味わいセクションの初期化
    initFlavorSection(log);
    initBeerDetailsSection(log);

    const delBtn = document.getElementById('btn-delete-beer');
    if (delBtn) {
        if (log) { delBtn.classList.remove('hidden'); delBtn.classList.add('flex'); }
        else { delBtn.classList.add('hidden'); delBtn.classList.remove('flex'); }
    }
    
    const saveBtn = document.getElementById('btn-save-beer');
    if (saveBtn) {
        saveBtn.textContent = log ? '更新する' : '記録する';
    }

    updateBeerKcalPreview();
    toggleModal('beer-modal', true);

    const container = document.querySelector('#beer-modal .overflow-y-auto');
    if (container) {
        container.scrollTop = 0;
    }
};

/**
 * フォーム入力内容を取得してオブジェクト化する
 * @param {Log|null} [existingLog=null] - 編集時は元のログデータを渡す
 * @returns {Object} 保存用データ
 */
export const getBeerFormData = (existingLog = null) => {
    const dateInput = /** @type {HTMLInputElement} */ (document.getElementById('beer-date'));
    const dateVal = dateInput.value;

    if (dateVal && dayjs(dateVal).isAfter(dayjs(), 'day')) {
        showMessage('未来の日付は選択できません', 'error');
        return null;
    }

    const brewery = /** @type {HTMLInputElement} */ (document.getElementById('beer-brewery')).value;
    const brand = /** @type {HTMLInputElement} */ (document.getElementById('beer-brand')).value;
    const rating = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('beer-rating')).value) || 0;
    const memo = /** @type {HTMLTextAreaElement} */ (document.getElementById('beer-memo')).value;
    const untappdCheck = /** @type {HTMLInputElement} */ (document.getElementById('untappd-check'));
    const useUntappd = untappdCheck ? untappdCheck.checked : false;

    const now = dayjs();
    const inputDate = dateVal ? dayjs(dateVal) : now;
    let ts;

    if (existingLog) {
        const originalDate = dayjs(existingLog.timestamp);
        const isSameDate = inputDate.format('YYYY-MM-DD') === originalDate.format('YYYY-MM-DD');

        if (isSameDate) {
            ts = existingLog.timestamp;
        } else {
            ts = inputDate
                .hour(originalDate.hour())
                .minute(originalDate.minute())
                .second(originalDate.second())
                .valueOf();
        }
    } else {
        const vToday = getVirtualDate();
        if (dateVal === vToday) {
            ts = Date.now();
        } else {
            ts = inputDate.startOf('day').add(12, 'hour').valueOf();
        }
    }
    
    const customSection = document.getElementById('beer-input-custom');
    const isCustom = customSection ? !customSection.classList.contains('hidden') : false;
    
    const styleSel = /** @type {HTMLSelectElement} */ (document.getElementById('beer-select'));
    const style = styleSel.value || APP.DEFAULTS.MODE1;
    
    const sizeSel = /** @type {HTMLSelectElement} */ (document.getElementById('beer-size'));
    const size = sizeSel.value;
    
    const countInput = /** @type {HTMLInputElement} */ (document.getElementById('beer-count'));
    let count = parseInt(countInput.value);
    if (!Number.isFinite(count) || count < 1) count = 1;
    
    const presetAbvInput = /** @type {HTMLInputElement} */ (document.getElementById('preset-abv'));
    const rawUserAbv = presetAbvInput ? parseFloat(presetAbvInput.value) : null;
    const userAbv = (rawUserAbv !== null && Number.isFinite(rawUserAbv)) ? rawUserAbv : null;

    const customAbvInput = /** @type {HTMLInputElement} */ (document.getElementById('custom-abv'));
    let customAbv = Math.abs(parseFloat(customAbvInput.value) || 5.0);
    if (customAbv > 100) customAbv = 100;

    const customAmountInput = /** @type {HTMLInputElement} */ (document.getElementById('custom-amount'));
    let customMl = Math.abs(parseInt(customAmountInput.value) || 350);
    if (customMl <= 0) customMl = 350;

    let type = 'sweet';
    let carb = 3.0;

    if (isCustom) {
        const typeEl = /** @type {HTMLInputElement} */ (document.querySelector('input[name="customType"]:checked'));
        type = typeEl ? typeEl.value : 'sweet';
        carb = (type === 'dry') ? 0.0 : 3.0;
    } else {
        const spec = STYLE_SPECS[style] || { carb: 3.5 };
        carb = spec.carb;
        type = (carb <= 0.5) ? 'dry' : 'sweet';
    }

    let finalAbv, finalMl;

    if (isCustom) {
        finalAbv = customAbv;
        finalMl = customMl;
    } else {
        const spec = STYLE_SPECS[style] || { abv: 5.0 };
        finalAbv = userAbv ?? spec.abv;     
        finalMl = parseInt(size) || 350;     
    }

    // ★修正版: showMessage を追加してユーザーへの通知と処理中断をセットで行う
    if (isNaN(finalMl) || finalMl <= 0 || finalMl > 10000) {
        showMessage('分量を正しく入力してください (最大10L)', 'error');
        return null;
    }
    if (isNaN(finalAbv) || finalAbv < 0 || finalAbv > 100) {
        showMessage('度数を正しく入力してください (0-100%)', 'error');
        return null;
    }
    if (isNaN(count) || count <= 0 || count > 100) {
        showMessage('本数を正しく入力してください (最大100本)', 'error');
        return null;
    }

    // 味わいプロファイルの収集
    const flavorProfile = getFlavorProfileData();

    return {
        timestamp: ts,
        brewery, brand, rating, memo,
        style, size, count,
        isCustom,
        userAbv,
        abv: finalAbv,
        ml: finalMl,
        carb: carb,
        customType: type,
        useUntappd,
        flavorProfile
    };
};

/**
 * リアルタイムカロリープレビュー
 */
export const updateBeerKcalPreview = () => {
    const previewEl = document.getElementById('beer-kcal-preview');
    if (!previewEl) return;

    try {
        const customSection = document.getElementById('beer-input-custom');
        const isCustom = customSection ? !customSection.classList.contains('hidden') : false;
        
        const countInput = /** @type {HTMLInputElement} */ (document.getElementById('beer-count'));
        let count = parseInt(countInput.value);
        if (!Number.isFinite(count) || count < 1) count = 1;

        let abv, carb, sizeMl;

        if (isCustom) {
            const amountInput = /** @type {HTMLInputElement} */ (document.getElementById('custom-amount'));
            sizeMl = parseInt(amountInput.value);
            if (!Number.isFinite(sizeMl) || sizeMl <= 0) sizeMl = 350;

            const customAbvInput = /** @type {HTMLInputElement} */ (document.getElementById('custom-abv'));
            const rawAbv = parseFloat(customAbvInput.value);
            abv = Number.isFinite(rawAbv) ? rawAbv : 5.0;

            const typeEl = /** @type {HTMLInputElement} */ (document.querySelector('input[name="customType"]:checked'));
            const type = typeEl ? typeEl.value : 'sweet';
            carb = (type === 'dry') ? 0.0 : 3.0;

        } else {
            const sizeSel = /** @type {HTMLSelectElement} */ (document.getElementById('beer-size'));
            sizeMl = parseInt(sizeSel.value) || 350;

            const styleSel = /** @type {HTMLSelectElement} */ (document.getElementById('beer-select'));
            const styleKey = styleSel.value;
            const spec = STYLE_SPECS[styleKey] || { abv: 5.0, carb: 3.5 };

            const presetAbvInput = /** @type {HTMLInputElement} */ (document.getElementById('preset-abv'));
            const rawUserAbv = parseFloat(presetAbvInput.value);
            abv = Number.isFinite(rawUserAbv) ? rawUserAbv : spec.abv;

            carb = spec.carb;
        }

        const kcal = Calc.calculateBeerDebit(sizeMl, abv, carb, count);

        previewEl.innerHTML =
            `${Math.round(kcal)} <span class="text-[11px] font-semibold ml-1 text-gray-500 dark:text-gray-400">kcal</span>`;

    } catch (e) {
        console.error(e);
    }
};

/**
 * 本数調整
 * @param {number} delta 
 */
export const adjustBeerCount = (delta) => {
    // @ts-ignore
    Feedback.uiDial();

    const el = /** @type {HTMLInputElement} */ (document.getElementById('beer-count'));
    if (!el) return;

    let val = parseInt(el.value);
    if (isNaN(val)) val = 1;

    val = Math.max(1, val + delta);
    el.value = String(val);

    updateBeerKcalPreview();

    if (typeof Feedback !== 'undefined') {
        if (Feedback.tap) Feedback.tap(); 
        if (Feedback.haptic) Feedback.haptic.light(); 
    }
};

/**
 * タブ切り替え
 * @param {string} mode - 'preset' | 'custom'
 */
export const switchBeerInputTab = (mode) => {
    const preset = document.getElementById('beer-input-preset');
    const custom = document.getElementById('beer-input-custom');
    const btnPreset = document.getElementById('tab-beer-preset');
    const btnCustom = document.getElementById('tab-beer-custom');
    
    if(!preset || !custom || !btnPreset || !btnCustom) return;

    const activeClasses = ['bg-brand', 'text-white', 'shadow-sm'];
    const inactiveClasses = ['text-gray-500', 'hover:bg-base-200', 'dark:hover:bg-base-800'];

    if (mode === 'preset') {
        preset.classList.remove('hidden'); custom.classList.add('hidden');
        btnPreset.classList.remove(...inactiveClasses); btnPreset.classList.add(...activeClasses);
        btnCustom.classList.remove(...activeClasses); btnCustom.classList.add(...inactiveClasses);
    } else {
        preset.classList.add('hidden'); custom.classList.remove('hidden');
        btnPreset.classList.remove(...activeClasses); btnPreset.classList.add(...inactiveClasses);
        btnCustom.classList.remove(...inactiveClasses); btnCustom.classList.add(...activeClasses);
    }
    updateBeerKcalPreview();
};

/**
 * フォームリセット
 * @param {boolean} [keepDate=false] 
 */
export const resetBeerForm = (keepDate = false) => {
    if (!keepDate) {
        /** @type {HTMLInputElement} */(document.getElementById('beer-date')).value = getVirtualDate();
    }
    
    const idField = /** @type {HTMLInputElement} */(document.getElementById('editing-log-id'));
    if(idField) idField.value = '';
    
    /** @type {HTMLInputElement} */(document.getElementById('beer-count')).value = '1';
    /** @type {HTMLInputElement} */(document.getElementById('beer-brewery')).value = '';
    /** @type {HTMLInputElement} */(document.getElementById('beer-brand')).value = '';
    /** @type {HTMLInputElement} */(document.getElementById('beer-rating')).value = '0';
    /** @type {HTMLTextAreaElement} */(document.getElementById('beer-memo')).value = '';
    
    const presetAbv = /** @type {HTMLInputElement} */(document.getElementById('preset-abv'));
    if(presetAbv) presetAbv.value = '';
    
    const untappdCheck = /** @type {HTMLInputElement} */(document.getElementById('untappd-check'));
    if(untappdCheck) untappdCheck.checked = false;

    const styleSel = /** @type {HTMLSelectElement} */ (document.getElementById('beer-select'));
    if (styleSel) {
        const mainBeerStyle = localStorage.getItem(APP.STORAGE_KEYS.MODE1) || APP.DEFAULTS.MODE1;
        styleSel.value = mainBeerStyle;
    }

    const sizeSel = /** @type {HTMLSelectElement} */ (document.getElementById('beer-size'));
    if (sizeSel) sizeSel.value = '350';

    // 味わいセクションのリセット
    resetFlavorSection();

    const detailInputs = document.getElementById('beer-details-inputs');
    const detailIcon = document.getElementById('beer-details-toggle-icon');
    if (detailInputs && detailIcon) {
        detailInputs.classList.add('hidden');
        detailIcon.style.transform = '';
    }

    switchBeerInputTab('preset');
};

export const searchUntappd = () => {
    const brewery = /** @type {HTMLInputElement} */(document.getElementById('beer-brewery')).value;
    const brand = /** @type {HTMLInputElement} */(document.getElementById('beer-brand')).value;
    if (!brand) { 
        showMessage('検索するにはビール名を入力してください', 'error'); 
        return; 
    }
    const query = encodeURIComponent(`${brewery} ${brand}`.trim());
    window.open(`https://untappd.com/search?q=${query}`, '_blank');
};

export const updateBeerSelectOptions = () => {
    const styleSel = /** @type {HTMLSelectElement} */ (document.getElementById('beer-select'));
    const sizeSel = /** @type {HTMLSelectElement} */ (document.getElementById('beer-size'));
    const mainBeerStyle = localStorage.getItem(APP.STORAGE_KEYS.MODE1) || APP.DEFAULTS.MODE1;
    
    if (styleSel && styleSel.children.length === 0) {
        const source = (typeof STYLE_METADATA !== 'undefined') ? STYLE_METADATA : CALORIES.STYLES;
        const styles = Object.keys(source || {});
        
        styles.forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = key;
            styleSel.appendChild(opt);
        });
        if (mainBeerStyle) styleSel.value = mainBeerStyle;
    } else if (styleSel && mainBeerStyle) {
        styleSel.value = mainBeerStyle;
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
};

/**
 * 入力候補の更新
 * ✅ LogService経由で全ログを取得し、ビールログを抽出してリスト化する
 */
// ===========================================
// 味わいセクション (Flavor Profile)
// ===========================================

const FLAVOR_OPENED_KEY = 'nomutore_flavor_opened';

const initBeerDetailsSection = (log = null) => {
    const toggle = document.getElementById('beer-details-toggle');
    const inputs = document.getElementById('beer-details-inputs');
    const icon = document.getElementById('beer-details-toggle-icon');
    if (!toggle || !inputs || !icon) return;

    const hasDetails = !!(log && (
        (log.brewery && log.brewery.trim()) ||
        ((log.brand || log.name) && String(log.brand || log.name).trim()) ||
        (log.rating && log.rating > 0) ||
        (log.memo && log.memo.trim()) ||
        log.flavorProfile
    ));

    const open = () => {
        inputs.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
    };

    const close = () => {
        inputs.classList.add('hidden');
        icon.style.transform = '';
    };

    toggle.onclick = () => {
        const isHidden = inputs.classList.contains('hidden');
        if (isHidden) open();
        else close();
    };

    if (hasDetails) open();
    else close();
};

/**
 * 味わいセクションの初期化
 * @param {Log|null} log - 編集時のログデータ
 */
const initFlavorSection = (log = null) => {
    const toggle = document.getElementById('flavor-toggle');
    const inputs = document.getElementById('flavor-inputs');
    const icon = document.getElementById('flavor-toggle-icon');
    if (!toggle || !inputs || !icon) return;

    // セグメントボタンのクリックイベント登録（onclick で重複防止）
    FLAVOR_AXES.forEach(axis => {
        const container = document.getElementById(`flavor-${axis.key}`);
        if (!container) return;
        container.querySelectorAll('.flavor-btn').forEach(btn => {
            btn.onclick = () => {
                // 同じボタンを再タップしたら解除（null に戻す）
                if (btn.classList.contains('bg-orange-500')) {
                    btn.classList.remove('bg-orange-500', 'text-white', 'shadow-sm');
                    btn.classList.add('bg-gray-100', 'dark:bg-gray-800', 'text-gray-500');
                    return;
                }
                // 同軸の他ボタンをリセット
                container.querySelectorAll('.flavor-btn').forEach(b => {
                    b.classList.remove('bg-orange-500', 'text-white', 'shadow-sm');
                    b.classList.add('bg-gray-100', 'dark:bg-gray-800', 'text-gray-500');
                });
                // 選択状態に
                btn.classList.remove('bg-gray-100', 'dark:bg-gray-800', 'text-gray-500');
                btn.classList.add('bg-orange-500', 'text-white', 'shadow-sm');
            };
        });
    });

    // 折りたたみトグル（onclick で重複防止）
    toggle.onclick = () => {
        const isHidden = inputs.classList.contains('hidden');
        inputs.classList.toggle('hidden');
        icon.style.transform = isHidden ? 'rotate(180deg)' : '';
        if (isHidden) {
            localStorage.setItem(FLAVOR_OPENED_KEY, 'true');
        }
    };

    // 編集時：既存データの復元
    if (log && log.flavorProfile) {
        const fp = log.flavorProfile;
        let hasAnyValue = false;

        FLAVOR_AXES.forEach(axis => {
            const val = fp[axis.key];
            if (val !== null && val !== undefined) {
                hasAnyValue = true;
                const container = document.getElementById(`flavor-${axis.key}`);
                if (!container) return;
                const btn = container.querySelector(`[data-val="${val}"]`);
                if (btn) {
                    btn.classList.remove('bg-gray-100', 'dark:bg-gray-800', 'text-gray-500');
                    btn.classList.add('bg-orange-500', 'text-white', 'shadow-sm');
                }
            }
        });

        // 既存データがあれば自動展開
        if (hasAnyValue) {
            inputs.classList.remove('hidden');
            icon.style.transform = 'rotate(180deg)';
        }
    } else if (localStorage.getItem(FLAVOR_OPENED_KEY)) {
        // 過去に一度でも開いたことがあれば自動展開
        inputs.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
    }
};

/**
 * 味わいセクションのリセット
 */
const resetFlavorSection = () => {
    FLAVOR_AXES.forEach(axis => {
        const container = document.getElementById(`flavor-${axis.key}`);
        if (!container) return;
        container.querySelectorAll('.flavor-btn').forEach(btn => {
            btn.classList.remove('bg-orange-500', 'text-white', 'shadow-sm');
            btn.classList.add('bg-gray-100', 'dark:bg-gray-800', 'text-gray-500');
        });
    });

    // 折りたたみ状態のリセット（ビール追加時は常に閉じて開始）
    const inputs = document.getElementById('flavor-inputs');
    const icon = document.getElementById('flavor-toggle-icon');
    if (inputs && icon) {
        inputs.classList.add('hidden');
        icon.style.transform = '';
    }
};

/**
 * 味わいプロファイルデータを収集
 * @returns {import('../types.js').FlavorProfile|null} 全軸nullならnullを返す
 */
const getFlavorProfileData = () => {
    /** @type {Record<string, number|null>} */
    const profile = {};
    let hasAnyValue = false;

    FLAVOR_AXES.forEach(axis => {
        const container = document.getElementById(`flavor-${axis.key}`);
        if (!container) {
            profile[axis.key] = null;
            return;
        }
        const selected = container.querySelector('.flavor-btn.bg-orange-500');
        if (selected) {
            profile[axis.key] = parseInt(selected.dataset.val);
            hasAnyValue = true;
        } else {
            profile[axis.key] = null;
        }
    });

    // 全軸未入力なら null（保存スペース節約）
    return hasAnyValue ? /** @type {import('../types.js').FlavorProfile} */ (profile) : null;
};

export const updateInputSuggestions = async () => {
    try {
        // 1. LogServiceから全ログを取得
        const allLogs = await LogService.getAll();
        
        // 2. ビールログだけを抽出
        const beerLogs = allLogs.filter(l => l.type === 'beer');
        
        // 3. 重複を除外してリスト化
        const breweries = [...new Set(beerLogs.map(l => l.brewery).filter(b => b))].sort();
        const brands = [...new Set(beerLogs.map(l => l.brand || l.name).filter(b => b))].sort();

        /**
         * @param {string} id
         * @param {string[]} items
         */
        const updateList = (id, items) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = ''; 
            
            // 最大50件程度に制限
            items.slice(0, 100).forEach(item => {
                const opt = document.createElement('option');
                opt.value = item;
                el.appendChild(opt);
            });
        };

        updateList('brewery-list', breweries);
        updateList('brand-list', brands);
        
    } catch (e) {
        console.error("Failed to update suggestions:", e);
    }
};


