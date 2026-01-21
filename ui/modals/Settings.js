import { APP, EXERCISE, CALORIES, CHECK_LIBRARY, CHECK_DEFAULT_IDS } from '../constants.js';
import { Store, db } from '../store.js';
import { UI, refreshUI } from './index.js'; // 循環参照に注意が必要だが、refreshUIのみならOK
import { DOM, showMessage } from './dom.js';

export const Settings = {
    render: () => {
        const profile = Store.getProfile();
        
        document.getElementById('weight-input').value = profile.weight || '';
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

        // Beer Modes
        Settings.updateBeerSelectors();
        
        // Exercise Selectors
        Settings.updateExerciseSelectors();

        // Check Editor List
        Settings.renderCheckEditor();
    },

    updateBeerSelectors: () => {
        const mode1 = document.getElementById('setting-mode-1');
        const mode2 = document.getElementById('setting-mode-2');
        const styles = Object.keys(CALORIES.STYLES);
        const currentModes = Store.getModes();

        [mode1, mode2].forEach(sel => {
            if(sel.children.length === 0) {
                styles.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s;
                    opt.textContent = s;
                    sel.appendChild(opt);
                });
            }
        });
        mode1.value = currentModes.mode1;
        mode2.value = currentModes.mode2;
    },

    updateExerciseSelectors: () => {
        const baseEx = document.getElementById('setting-base-exercise');
        const defRec = document.getElementById('setting-default-record-exercise');
        
        const populate = (sel) => {
            if(sel.children.length === 0) {
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

        baseEx.value = Store.getBaseExercise();
        defRec.value = Store.getDefaultRecordExercise();
    },

    renderCheckEditor: () => {
        const container = document.getElementById('check-editor-list');
        if(!container) return;
        
        let schema = JSON.parse(localStorage.getItem('nomutore_check_schema'));
        if (!schema) schema = CHECK_DEFAULT_IDS.map(id => CHECK_LIBRARY.find(i => i.id === id)).filter(Boolean);

        container.innerHTML = schema.map(item => `
            <div class="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl mb-2 border border-gray-100 dark:border-gray-700">
                <div class="flex items-center gap-3">
                    <span class="text-xl">${item.icon}</span>
                    <span class="text-sm font-bold dark:text-white">${item.label}</span>
                </div>
                <button onclick="removeCheckItem('${item.id}')" class="text-red-400 hover:text-red-600 px-2">
                    <i class="ph-bold ph-minus-circle"></i>
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
        
        // 画面リフレッシュ
        await window.UI.refreshUI(); 
        window.UI.switchTab('home');
    }
};