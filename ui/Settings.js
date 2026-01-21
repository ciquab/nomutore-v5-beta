import { APP, EXERCISE, CALORIES, CHECK_LIBRARY, CHECK_DEFAULT_IDS } from '../constants.js';
import { Store, db } from '../store.js';
import { Service } from '../service.js';
import { DOM, showMessage, applyTheme } from './dom.js';
import { updateBeerSelectOptions } from './modals/BeerModal.js'; // ここからインポート
import { getActiveSchemaFromIds } from './modals/CheckModal.js'; // ヘルパー再利用

// 内部ヘルパー
const findItemInLibrary = (id) => {
    const allItems = Object.values(CHECK_LIBRARY).flat();
    return allItems.find(i => i.id === id);
};

export const Settings = {
    render: () => {
        const profile = Store.getProfile();
        
        const wInput = document.getElementById('weight-input');
        if (wInput) wInput.value = profile.weight || '';
        document.getElementById('height-input').value = profile.height || '';
        document.getElementById('age-input').value = profile.age || '';
        document.getElementById('gender-input').value = profile.gender || 'male';
        
        document.getElementById('theme-input').value = localStorage.getItem(APP.STORAGE_KEYS.THEME) || 'system';

        const periodMode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || APP.DEFAULTS.PERIOD_MODE;
        document.getElementById('setting-period-mode').value = periodMode;
        
        const durationContainer = document.getElementById('setting-period-duration-container');
        if (periodMode === 'custom') {
            durationContainer.classList.remove('hidden');
            document.getElementById('setting-period-duration').value = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_DURATION) || 14;
        } else {
            durationContainer.classList.add('hidden');
        }

        // Beer設定の更新
        updateBeerSelectOptions();
        const mode1Sel = document.getElementById('setting-mode-1');
        const mode2Sel = document.getElementById('setting-mode-2');
        if(mode1Sel) mode1Sel.value = localStorage.getItem(APP.STORAGE_KEYS.MODE1) || APP.DEFAULTS.MODE1;
        if(mode2Sel) mode2Sel.value = localStorage.getItem(APP.STORAGE_KEYS.MODE2) || APP.DEFAULTS.MODE2;

        // Exercise設定の更新
        Settings.updateExerciseSelectors();
        
        // Check項目エディタの描画
        Settings.renderCheckEditor();
    },

    updateExerciseSelectors: () => {
        const baseEx = document.getElementById('setting-base-exercise');
        const defRec = document.getElementById('setting-default-record-exercise');
        
        const populate = (sel) => {
            if(sel && sel.children.length === 0) {
                Object.entries(EXERCISE).forEach(([k, v]) => {
                    const opt = document.createElement('option');
                    opt.value = k;
                    opt.textContent = v.label;
                    sel.appendChild(opt);
                });
            }
        };
        populate(baseEx);
        populate(defRec);

        if(baseEx) baseEx.value = Store.getBaseExercise();
        if(defRec) defRec.value = Store.getDefaultRecordExercise();
    },

    renderCheckEditor: () => {
        const container = document.getElementById('check-editor-list');
        if(!container) return;
        
        let schema = [];
        try {
            schema = JSON.parse(localStorage.getItem('nomutore_check_schema'));
        } catch(e) {}

        if (!schema || schema.length === 0) {
            schema = getActiveSchemaFromIds(CHECK_DEFAULT_IDS);
            localStorage.setItem('nomutore_check_schema', JSON.stringify(schema));
        }

        container.innerHTML = schema.map((item, index) => `
            <div class="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl mb-2 border border-gray-100 dark:border-gray-700">
                <div class="flex items-center gap-3">
                    <span class="text-xl">${item.icon}</span>
                    <div>
                        <div class="text-sm font-bold dark:text-white">${item.label}</div>
                        <div class="text-[10px] text-gray-400">
                            ${item.desc || ''}
                            ${item.drinking_only ? '<span class="text-orange-500 font-bold ml-1">🍺 Drink Only</span>' : ''}
                        </div>
                    </div>
                </div>
                <button onclick="removeCheckItem(${index})" class="text-red-400 hover:text-red-600 px-2 bg-transparent">
                    <i class="ph-bold ph-minus-circle text-lg"></i>
                </button>
            </div>
        `).join('');
    },

    save: async () => {
        const btn = document.getElementById('btn-save-settings');
        const originalText = btn ? btn.textContent : 'Save';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Saving...';
        }

        try {
            const weight = document.getElementById('weight-input').value;
            const height = document.getElementById('height-input').value;
            const age = document.getElementById('age-input').value;
            const gender = document.getElementById('gender-input').value;

            if (!weight || !height || !age) {
                showMessage('Profile info incomplete.', 'error');
                return;
            }

            // 個別キーへの保存 (Store.getProfile仕様)
            localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, weight);
            localStorage.setItem(APP.STORAGE_KEYS.HEIGHT, height);
            localStorage.setItem(APP.STORAGE_KEYS.AGE, age);
            localStorage.setItem(APP.STORAGE_KEYS.GENDER, gender);
            
            const profile = { weight, height, age, gender };
            localStorage.setItem(APP.STORAGE_KEYS.PROFILE, JSON.stringify(profile));

            // Theme
            const theme = document.getElementById('theme-input').value;
            localStorage.setItem(APP.STORAGE_KEYS.THEME, theme);
            applyTheme(theme);

            // Period
            const periodMode = document.getElementById('setting-period-mode').value;
            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_MODE, periodMode);
            if(periodMode === 'custom') {
                const dur = document.getElementById('setting-period-duration').value;
                localStorage.setItem(APP.STORAGE_KEYS.PERIOD_DURATION, dur);
            }
            // 期間設定変更を反映（Service呼び出し）
            await Service.updatePeriodSettings(periodMode);

            // Modes
            const m1 = document.getElementById('setting-mode-1').value;
            const m2 = document.getElementById('setting-mode-2').value;
            localStorage.setItem(APP.STORAGE_KEYS.MODE1, m1);
            localStorage.setItem(APP.STORAGE_KEYS.MODE2, m2);
            localStorage.setItem(APP.STORAGE_KEYS.BASE_EXERCISE, document.getElementById('setting-base-exercise').value);
            localStorage.setItem(APP.STORAGE_KEYS.DEFAULT_RECORD_EXERCISE, document.getElementById('setting-default-record-exercise').value);

            // Header UI 即時更新
            const headerSel = document.getElementById('header-mode-select');
            if(headerSel) {
                headerSel.options[0].text = m1;
                headerSel.options[1].text = m2;
            }

            showMessage('Settings Saved!', 'success');
            
            document.dispatchEvent(new CustomEvent('refresh-ui'));
            if (window.UI) {
                await window.UI.refreshUI(); 
                window.UI.switchTab('home');
            }

        } catch(e) {
            console.error(e);
            showMessage('Error saving settings', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    }
};

// HTML onclick用のグローバル関数
window.removeCheckItem = (index) => {
    if(!confirm('この項目を削除しますか？')) return;
    let schema = [];
    try { schema = JSON.parse(localStorage.getItem('nomutore_check_schema')); } catch(e) {}
    schema.splice(index, 1);
    localStorage.setItem('nomutore_check_schema', JSON.stringify(schema));
    Settings.renderCheckEditor();
};

window.addNewCheckItem = () => {
    const label = prompt('項目名を入力してください (例: 筋トレ)');
    if(!label) return;
    const icon = prompt('アイコン絵文字を入力してください (例: 💪)', '💪');
    const desc = prompt('説明を入力してください (例: 30分以上やった)', '');
    const drinkingOnly = confirm('「お酒を飲んだ日」だけ表示しますか？\n(OK=はい / キャンセル=いいえ[毎日表示])');

    const id = `custom_${Date.now()}`;
    const newItem = {
        id, label, icon: icon || '✅', type: 'boolean', desc, drinking_only: drinkingOnly
    };

    let schema = [];
    try { schema = JSON.parse(localStorage.getItem('nomutore_check_schema') || '[]'); } catch(e) {}
    schema.push(newItem);
    localStorage.setItem('nomutore_check_schema', JSON.stringify(schema));
    Settings.renderCheckEditor();
};