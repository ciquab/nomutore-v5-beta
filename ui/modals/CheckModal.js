import { CHECK_SCHEMA, CHECK_LIBRARY, CHECK_PRESETS, CHECK_DEFAULT_IDS, APP } from '../../constants.js';
import { db } from '../../store.js';
import { DOM, toggleModal, toggleDryDay, showMessage } from '../dom.js';
import { StateManager } from '../state.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// 内部ヘルパー: IDリストからスキーマオブジェクトの配列を生成
const getActiveSchemaFromIds = (ids) => {
    const allItems = Object.values(CHECK_LIBRARY).flat();
    return ids.map(id => allItems.find(i => i.id === id)).filter(Boolean);
};

export const CheckModal = {
    open: async (dateStr = null) => {
        const targetDate = dateStr || StateManager.selectedDate || dayjs().format('YYYY-MM-DD');
        const dateInput = document.getElementById('check-date');
        if(dateInput) dateInput.value = targetDate;

        // ★追加: 休肝日スイッチと項目の表示/非表示を同期する関数
        const syncDryDayUI = (isDry) => {
            const items = document.querySelectorAll('.drinking-only');
            items.forEach(el => {
                if (isDry) {
                    el.classList.add('hidden');
                    // 隠すときはチェックも外す（データの矛盾防止）
                    const cb = el.querySelector('input');
                    if(cb && cb.checked) {
                        cb.checked = false;
                        // 親divのスタイルも未選択状態に戻す
                        el.className = el.className.replace('bg-indigo-600 border-indigo-600 text-white shadow-md', 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-indigo-300');
                    }
                } else {
                    el.classList.remove('hidden');
                }
            });
            // DOM側のトグルスイッチの表示更新（関数呼び出しなど）
            toggleDryDay(isDry);
        };

        const isDryCheck = document.getElementById('check-is-dry');
        // イベントリスナー設定
        if(isDryCheck) {
            isDryCheck.onclick = (e) => syncDryDayUI(e.target.checked);
            // ロック状態のリセット
            isDryCheck.disabled = false;
        }

        // ラベルのリセット
        const dryLabelContainer = isDryCheck ? isDryCheck.closest('#drinking-section') : null;
        const dryLabelText = dryLabelContainer ? dryLabelContainer.querySelector('span.font-bold') : null;
        if (dryLabelText) dryLabelText.innerHTML = "Is today a Dry Day?";
        if (dryLabelContainer) dryLabelContainer.classList.remove('opacity-50', 'pointer-events-none');


        // データ取得
        const tsStart = dayjs(targetDate).startOf('day').valueOf();
        const tsEnd = dayjs(targetDate).endOf('day').valueOf();
        
        // ★追加: ビール記録があるかどうかもチェック
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
            
            // drinking_onlyクラスを付与
            if (item.drinking_only) div.classList.add('drinking-only');

            // スタイル定義
            const baseClass = "p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1 h-24";
            const checkedClass = "bg-indigo-600 border-indigo-600 text-white shadow-md";
            const uncheckedClass = "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-indigo-300";
            
            // 初期クラス設定 (休肝日かつDrinkOnlyアイテムなら隠す)
            let isHidden = false;
            if (item.drinking_only && existing && existing.isDryDay) isHidden = true;
            
            div.className = `${baseClass} ${isChecked ? checkedClass : uncheckedClass} ${isHidden ? 'hidden' : ''}`;

            div.onclick = () => {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
                
                if(cb.checked) {
                    div.className = `${baseClass} ${checkedClass} ${item.drinking_only ? 'drinking-only' : ''}`;
                    
                    // ★追加: 飲酒時のみ項目をONにしたら、休肝日チェックを強制OFFにする
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

        // 初期状態の反映
        const saveBtn = document.getElementById('btn-save-check');
        
        if (existing) {
            if (isDryCheck) isDryCheck.checked = existing.isDryDay;
            syncDryDayUI(existing.isDryDay);
            if (saveBtn) saveBtn.textContent = 'Update Check';
        } else {
            if (isDryCheck) isDryCheck.checked = false;
            syncDryDayUI(false);
            if (saveBtn) saveBtn.textContent = 'Save Check';
        }

        // ★追加: ビール記録がある場合、休肝日チェックを強制OFF＆無効化
        if (beerLogsCount > 0) {
            if (isDryCheck) {
                isDryCheck.checked = false;
                isDryCheck.disabled = true;
            }
            syncDryDayUI(false); // 飲酒項目を表示
            
            if (dryLabelContainer) dryLabelContainer.classList.add('opacity-50', 'pointer-events-none');
            if (dryLabelText) dryLabelText.innerHTML = "Is today a Dry Day? <span class='text-[10px] text-red-500 font-bold ml-2'>(Alcohol Recorded)</span>";
        }

        toggleModal('check-modal', true);
    },

    openLibrary: () => {
        const container = document.getElementById('library-content');
        container.innerHTML = '';
        
        const currentSchema = JSON.parse(localStorage.getItem('nomutore_check_schema') || '[]');
        const currentIds = currentSchema.map(i => i.id);

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
                const isSelected = currentIds.includes(item.id);
                const div = document.createElement('div');
                div.className = 'flex items-center justify-between p-3 border rounded-xl bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700';
                div.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg">
                            ${item.icon}
                        </div>
                        <div>
                            <div class="text-xs font-bold text-base-900 dark:text-white">${item.label}</div>
                            <div class="text-[9px] text-gray-400">${item.desc || ''}</div>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only peer library-check" value="${item.id}" ${isSelected ? 'checked' : ''}>
                        <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                `;
                grid.appendChild(div);
            });
            section.appendChild(grid);
            container.appendChild(section);
        });

        toggleModal('check-library-modal', true);
    },

    applyPreset: (type) => {
        const preset = CHECK_PRESETS[type];
        if (!preset) return;
        const presetIds = preset.ids || CHECK_DEFAULT_IDS;
        
        const checkboxes = document.querySelectorAll('.library-check');
        checkboxes.forEach(cb => {
            cb.checked = presetIds.includes(cb.value);
        });
        showMessage(`Applied preset: ${preset.label || type}`, 'success');
    },

    saveLibraryChanges: () => {
        const checkboxes = document.querySelectorAll('.library-check');
        const selectedIds = [];
        checkboxes.forEach(cb => {
            if (cb.checked) selectedIds.push(cb.value);
        });
        
        let currentSchema = [];
        try { currentSchema = JSON.parse(localStorage.getItem('nomutore_check_schema') || '[]'); } catch(e){}
        
        const allLibraryIds = Object.values(CHECK_LIBRARY).flat().map(i => i.id);
        const customItems = currentSchema.filter(item => !allLibraryIds.includes(item.id));
        
        const newSchemaFromLibrary = getActiveSchemaFromIds(selectedIds);
        const finalSchema = [...newSchemaFromLibrary, ...customItems];
        
        localStorage.setItem('nomutore_check_schema', JSON.stringify(finalSchema));
        
        // 設定画面がもし開かれていたら更新
        import('../Settings.js').then(m => m.Settings.renderCheckEditor());

        toggleModal('check-library-modal', false);
        showMessage('Check items updated!', 'success');
    }

};

export const openCheckLibrary = CheckModal.openLibrary;
export const applyPreset = CheckModal.applyPreset;
export const saveLibraryChanges = CheckModal.saveLibraryChanges;
export const openCheckModal = CheckModal.open;

