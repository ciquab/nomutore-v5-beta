import { APP, EXERCISE, CALORIES, CHECK_LIBRARY, CHECK_DEFAULT_IDS, STYLE_METADATA } from '../constants.js';
import { Store, db } from '../store.js';
import { Service } from '../service.js';
import { DOM, showMessage, applyTheme } from './dom.js';

// 内部ヘルパー (Check Editor用)
const findItemInLibrary = (id) => {
    const allItems = Object.values(CHECK_LIBRARY).flat();
    return allItems.find(i => i.id === id);
};

// Check Editor描画関数 (modal.jsにあったもの)
const renderCheckEditor = () => {
    const container = document.getElementById('check-editor-list');
    if(!container) return;
    
    let schema = [];
    try {
        schema = JSON.parse(localStorage.getItem('nomutore_check_schema'));
    } catch(e) {}

    if (!schema || schema.length === 0) {
        // const { getActiveSchemaFromIds } = await import('./modals/checkModal.js'); // 循環参照回避のため簡易実装または直接ロジック記述
        // 元のmodal.jsでは同じファイル内にあったため、ここでは簡易的な復元を行うか、
        // 厳密には CheckModal.js のヘルパーを使うべきだが、依存を減らすためここで処理する
        const allItems = Object.values(CHECK_LIBRARY).flat();
        schema = CHECK_DEFAULT_IDS.map(id => allItems.find(i => i.id === id)).filter(Boolean);
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
};

export const Settings = {
    // 元の renderSettings 関数を再現
    render: () => {
        const currentMode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || 'weekly';
        const periodSel = document.getElementById('setting-period-mode');
        const durationInput = document.getElementById('setting-period-duration');
        const durationContainer = document.getElementById('setting-period-duration-container');
        const savedDuration = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_DURATION) || APP.DEFAULTS.PERIOD_DURATION;

        if (periodSel) {
            periodSel.value = currentMode;
            periodSel.onchange = () => {
                if (periodSel.value === 'custom') durationContainer.classList.remove('hidden');
                else durationContainer.classList.add('hidden');
            };
            if (currentMode === 'custom') durationContainer.classList.remove('hidden');
            else durationContainer.classList.add('hidden');
        }
        if (durationInput) durationInput.value = savedDuration;

        // プロフィール値の反映
        const profile = Store.getProfile();
        const wInput = document.getElementById('weight-input');
        const hInput = document.getElementById('height-input');
        const aInput = document.getElementById('age-input');
        const gInput = document.getElementById('gender-input');

        if (wInput) wInput.value = profile.weight;
        if (hInput) hInput.value = profile.height;
        if (aInput) aInput.value = profile.age;
        if (gInput) gInput.value = profile.gender;
        
        // テーマ設定
        const themeInput = document.getElementById('theme-input');
        if (themeInput) {
            themeInput.value = localStorage.getItem(APP.STORAGE_KEYS.THEME) || 'system';
        }

        // 設定画面のプルダウン選択肢生成ロジック
        const mode1Sel = document.getElementById('setting-mode-1');
        const mode2Sel = document.getElementById('setting-mode-2');
        // STYLE_METADATAがなければCALORIES.STYLESをフォールバックとして使う
        const source = (typeof STYLE_METADATA !== 'undefined') ? STYLE_METADATA : CALORIES.STYLES;
        const styles = Object.keys(source || {});
        
        [mode1Sel, mode2Sel].forEach(sel => {
            if (sel && sel.children.length === 0) {
                styles.forEach(style => {
                    const opt = document.createElement('option');
                    opt.value = style;
                    opt.textContent = style;
                    sel.appendChild(opt);
                });
            }
        });
        
        if(mode1Sel) mode1Sel.value = localStorage.getItem(APP.STORAGE_KEYS.MODE1) || APP.DEFAULTS.MODE1;
        if(mode2Sel) mode2Sel.value = localStorage.getItem(APP.STORAGE_KEYS.MODE2) || APP.DEFAULTS.MODE2;

        const baseExSel = document.getElementById('setting-base-exercise');
        const defRecExSel = document.getElementById('setting-default-record-exercise');
        
        [baseExSel, defRecExSel].forEach(sel => {
            if (sel && sel.children.length === 0) {
                Object.entries(EXERCISE).forEach(([key, val]) => {
                    const opt = document.createElement('option');
                    opt.value = key;
                    opt.textContent = val.label;
                    sel.appendChild(opt);
                });
            }
        });

        if(baseExSel) baseExSel.value = localStorage.getItem(APP.STORAGE_KEYS.BASE_EXERCISE) || APP.DEFAULTS.BASE_EXERCISE;
        if(defRecExSel) defRecExSel.value = localStorage.getItem(APP.STORAGE_KEYS.DEFAULT_RECORD_EXERCISE) || APP.DEFAULTS.DEFAULT_RECORD_EXERCISE;

        renderCheckEditor();
    },

    // 元の handleSaveSettings 関数を再現
    save: async () => {
        const btn = document.getElementById('btn-save-settings');
        const originalText = btn ? btn.textContent : 'Save';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Saving...';
        }

        try {
            const periodSel = document.getElementById('setting-period-mode');
            const newMode = periodSel ? periodSel.value : 'weekly';
            const durationInput = document.getElementById('setting-period-duration');
            if (durationInput && durationInput.value) {
                localStorage.setItem(APP.STORAGE_KEYS.PERIOD_DURATION, durationInput.value);
            }
            // ★重要: 元のロジック通り Service.updatePeriodSettings だけを呼ぶ
            await Service.updatePeriodSettings(newMode);

            const w = document.getElementById('weight-input').value;
            const h = document.getElementById('height-input').value;
            const a = document.getElementById('age-input').value;
            const g = document.getElementById('gender-input').value;
            if(w) localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, w);
            if(h) localStorage.setItem(APP.STORAGE_KEYS.HEIGHT, h);
            if(a) localStorage.setItem(APP.STORAGE_KEYS.AGE, a);
            if(g) localStorage.setItem(APP.STORAGE_KEYS.GENDER, g);

            const m1 = document.getElementById('setting-mode-1').value;
            const m2 = document.getElementById('setting-mode-2').value;
            const base = document.getElementById('setting-base-exercise').value;
            const defRec = document.getElementById('setting-default-record-exercise').value;
            localStorage.setItem(APP.STORAGE_KEYS.MODE1, m1);
            localStorage.setItem(APP.STORAGE_KEYS.MODE2, m2);
            localStorage.setItem(APP.STORAGE_KEYS.BASE_EXERCISE, base);
            localStorage.setItem(APP.STORAGE_KEYS.DEFAULT_RECORD_EXERCISE, defRec);
            
            const theme = document.getElementById('theme-input').value;
            localStorage.setItem(APP.STORAGE_KEYS.THEME, theme);
            applyTheme(theme);

            const headerSel = document.getElementById('header-mode-select');
            if(headerSel) {
                headerSel.options[0].text = m1;
                headerSel.options[1].text = m2;
            }

            showMessage('設定を保存しました', 'success');
            document.dispatchEvent(new CustomEvent('refresh-ui'));
            
            // ★追加: 画面遷移 (modal.jsにはなかったがUX上必要)
            if (window.UI && window.UI.switchTab) {
                window.UI.switchTab('home');
            }

        } catch(e) {
            console.error(e);
            showMessage('設定保存中にエラーが発生しました', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    }
};

// Global handlers (HTML onclick対応)
window.removeCheckItem = (index) => {
    if(!confirm('この項目を削除しますか？')) return;
    let schema = [];
    try { schema = JSON.parse(localStorage.getItem('nomutore_check_schema')); } catch(e) {}
    schema.splice(index, 1);
    localStorage.setItem('nomutore_check_schema', JSON.stringify(schema));
    renderCheckEditor();
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
    renderCheckEditor();
};