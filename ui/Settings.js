import { APP, EXERCISE, CALORIES, CHECK_LIBRARY, CHECK_DEFAULT_IDS } from '../constants.js';
import { Store, db } from '../store.js';
import { UI, refreshUI } from './index.js';
import { DOM, showMessage } from './dom.js';

// ライブラリ全体からIDでアイテムを探すヘルパー
const findItemInLibrary = (id) => {
    // CHECK_LIBRARYは { general: [], diet: [] ... } の形式なのでフラット化して検索
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

        Settings.updateBeerSelectors();
        Settings.updateExerciseSelectors();
        Settings.renderCheckEditor();
    },

    updateBeerSelectors: () => {
        const mode1 = document.getElementById('setting-mode-1');
        const mode2 = document.getElementById('setting-mode-2');
        const styles = Object.keys(CALORIES.STYLES);
        const currentModes = Store.getModes();

        [mode1, mode2].forEach(sel => {
            if(sel && sel.children.length === 0) {
                styles.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s;
                    opt.textContent = s;
                    sel.appendChild(opt);
                });
            }
        });
        if(mode1) mode1.value = currentModes.mode1;
        if(mode2) mode2.value = currentModes.mode2;
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

        // ★修正: 初期値がない、または空の場合はデフォルトIDから復元
        if (!schema || schema.length === 0) {
            schema = CHECK_DEFAULT_IDS.map(id => findItemInLibrary(id)).filter(Boolean);
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
        const weight = parseFloat(document.getElementById('weight-input').value);
        const height = parseFloat(document.getElementById('height-input').value);
        const age = parseFloat(document.getElementById('age-input').value);
        const gender = document.getElementById('gender-input').value;

        if (!weight || !height || !age) {
            showMessage('Profile info incomplete.', 'error');
            return;
        }

        const profile = { weight, height, age, gender };
        localStorage.setItem(APP.STORAGE_KEYS.PROFILE, JSON.stringify(profile));

        // Theme
        const theme = document.getElementById('theme-input').value;
        localStorage.setItem(APP.STORAGE_KEYS.THEME, theme);
        UI.applyTheme(theme);

        // Period
        const periodMode = document.getElementById('setting-period-mode').value;
        localStorage.setItem(APP.STORAGE_KEYS.PERIOD_MODE, periodMode);
        if(periodMode === 'custom') {
            const dur = document.getElementById('setting-period-duration').value;
            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_DURATION, dur);
        }

        // Modes
        localStorage.setItem(APP.STORAGE_KEYS.MODE1, document.getElementById('setting-mode-1').value);
        localStorage.setItem(APP.STORAGE_KEYS.MODE2, document.getElementById('setting-mode-2').value);
        localStorage.setItem(APP.STORAGE_KEYS.BASE_EXERCISE, document.getElementById('setting-base-exercise').value);
        localStorage.setItem(APP.STORAGE_KEYS.DEFAULT_RECORD_EXERCISE, document.getElementById('setting-default-record-exercise').value);

        showMessage('Settings Saved!', 'success');
        
        await window.UI.refreshUI(); 
        window.UI.switchTab('home');
    }
};

// ★復元: グローバル関数として公開 (HTMLのonclickから呼ばれる)
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