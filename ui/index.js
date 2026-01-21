import { Calc } from '../logic.js';
import { Store, db } from '../store.js';
import { Service } from '../service.js';
import { APP, CHECK_SCHEMA } from '../constants.js';
import { DOM, toggleModal, showConfetti, showMessage, applyTheme, toggleDryDay } from './dom.js';
import { StateManager } from './state.js';

import { renderBeerTank } from './beerTank.js';
import { renderLiverRank } from './liverRank.js';
import { renderCheckStatus } from './checkStatus.js';
import { renderWeeklyAndHeatUp, renderHeatmap } from './weekly.js';
import { renderChart } from './chart.js';
import { updateLogListView, toggleEditMode, toggleSelectAll, updateBulkCount, setFetchLogsHandler } from './logList.js';
import { renderBeerStats } from './beerStats.js';
import { renderArchives } from './archiveManager.js';
import { Timer } from './timer.js';

// ★変更: 新しいモジュール構成からのインポート
import { 
    getBeerFormData, resetBeerForm, openBeerModal, switchBeerInputTab, 
    adjustBeerCount, searchUntappd, updateBeerSelectOptions,
    openCheckModal, openCheckLibrary, applyPreset, applyLibraryChanges,
    openManualInput, 
    openHelp, closeModal, 
    openTimer, closeTimer,
    openActionMenu, handleActionSelect,
    updateModeSelector
} from './modals/index.js';

// ★変更: 設定画面ロジックのインポート
import { Settings } from './Settings.js';

import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const refreshUI = async () => {
    if (StateManager.isLoadingLogs) return;
    
    const { logs, checks } = await Service.getAllDataForUI();
    const profile = Store.getProfile();
    
    let currentBalance = 0;
    logs.forEach(l => {
        if(l.kcal) currentBalance += l.kcal;
        else if(l.type === 'exercise') currentBalance += Calc.calculateExerciseBurn(6.0, l.minutes, profile); 
        else if(l.type === 'beer') currentBalance -= 140; 
    });
    renderBeerTank(currentBalance);

    renderLiverRank(checks, logs);
    renderCheckStatus(checks, logs);

    await renderWeeklyAndHeatUp(logs, checks);
    renderHeatmap(logs, checks);

    renderChart(logs, checks);

    updateLogListView(true); 
};

export const UI = {
    setFetchLogsHandler: (fn) => { setFetchLogsHandler(fn); },
    _fetchAllDataHandler: null,
    setFetchAllDataHandler: (fn) => { UI._fetchAllDataHandler = fn; },

    init: () => {
        DOM.init();
        
        const bind = (id, event, fn) => {
            const el = document.getElementById(id);
            if(el) el.addEventListener(event, fn);
        };

        bind('nav-tab-home', 'click', () => UI.switchTab('home'));
        bind('nav-tab-record', 'click', () => UI.switchTab('record'));
        bind('nav-tab-cellar', 'click', () => UI.switchTab('cellar'));
        bind('nav-tab-settings', 'click', () => UI.switchTab('settings'));

        bind('header-mode-select', 'change', (e) => {
            StateManager.setBeerMode(e.target.value);
            refreshUI();
        });

        const modes = Store.getModes();
        const headerSel = document.getElementById('header-mode-select');
        if(headerSel && modes) {
            headerSel.options[0].text = modes.mode1 || 'Lager';
            headerSel.options[1].text = modes.mode2 || 'Ale';
            headerSel.value = StateManager.beerMode;
        }

        bind('btn-save-beer', 'click', () => {
            const dateEl = document.getElementById('beer-date');
            if (!dateEl || !dateEl.value) {
                showMessage('日付を選択してください', 'error');
                return;
            }
            const data = getBeerFormData();
            // バリデーションエラー時は null が返る想定
            if (data) {
                const event = new CustomEvent('save-beer', { detail: data });
                document.dispatchEvent(event);
                closeModal('beer-modal'); // ここで閉じる
            } else {
                showMessage('入力値を確認してください', 'error');
            }
        });

        bind('btn-save-beer-next', 'click', () => {
            const data = getBeerFormData();
            if (data) {
                const event = new CustomEvent('save-beer', { detail: data });
                document.dispatchEvent(event);
                
                showMessage('Saved! Ready for next.', 'success');
                resetBeerForm(); // 引数なしでリセット（日付保持ロジックはmodal側に任せるか、必要なら引数追加）
                const container = document.querySelector('#beer-modal .overflow-y-auto');
                if(container) container.scrollTop = 0;
            } else {
                showMessage('入力値を確認してください', 'error');
            }
        });
        
        bind('btn-search-untappd', 'click', searchUntappd);

        bind('btn-save-exercise', 'click', async () => {
            const date = document.getElementById('manual-date').value;
            const minutes = parseInt(document.getElementById('manual-minutes').value, 10);
            const key = document.getElementById('exercise-select').value;
            
            const idField = document.getElementById('editing-exercise-id');
            const editId = idField && idField.value ? parseInt(idField.value) : null;

            const bonusEl = document.getElementById('manual-apply-bonus');
            const applyBonus = bonusEl ? bonusEl.checked : true;

            if (!date || !minutes || minutes <= 0) {
                showMessage('日付と時間を入力してください', 'error');
                return;
            }

            const detail = {
                exerciseKey: key,
                minutes: minutes,
                date: date,
                applyBonus: applyBonus,
                id: editId || null 
            };

            document.dispatchEvent(new CustomEvent('save-exercise', { detail }));
            closeModal('exercise-modal');
        });

        bind('btn-delete-exercise', 'click', async () => {
            const idVal = document.getElementById('editing-exercise-id').value;
            if (!idVal) return;
            await Service.deleteLog(parseInt(idVal));
            closeModal('exercise-modal');
        });

        bind('btn-save-check', 'click', () => {
            const date = document.getElementById('check-date').value;
            const isDryDay = document.getElementById('check-is-dry').checked;
            const weight = document.getElementById('check-weight').value;
            
            let schema = CHECK_SCHEMA;
            try {
                const stored = localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA); // 定数は適宜確認
                if (stored) schema = JSON.parse(stored);
            } catch(e) {}

            const detail = { date, isDryDay, weight, isSaved: true };

            schema.forEach(item => {
                const el = document.getElementById(`check-${item.id}`);
                if(el) detail[item.id] = el.checked;
            });

            document.dispatchEvent(new CustomEvent('save-check', { detail }));
            closeModal('check-modal');
        });

        // ★追加: 設定保存ボタン
        bind('btn-save-settings', 'click', () => {
            Settings.save();
        });

        bind('tab-beer-preset', 'click', () => switchBeerInputTab('preset'));
        bind('tab-beer-custom', 'click', () => switchBeerInputTab('custom'));
        
        const themeSel = document.getElementById('theme-input');
        if(themeSel) themeSel.addEventListener('change', (e) => {
            localStorage.setItem(APP.STORAGE_KEYS.THEME, e.target.value);
            applyTheme(e.target.value);
        });

        bind('heatmap-prev', 'click', () => {
            StateManager.setHeatmapOffset(StateManager.heatmapOffset + 1);
            refreshUI();
        });
        bind('heatmap-next', 'click', () => {
            if(StateManager.heatmapOffset > 0) {
                StateManager.setHeatmapOffset(StateManager.heatmapOffset - 1);
                refreshUI();
            }
        });

        const filters = document.getElementById('chart-filters');
        if(filters) {
            filters.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    StateManager.setChartRange(btn.dataset.range);
                    refreshUI();
                });
            });
        }
        
        bind('btn-timer-toggle', 'click', Timer.toggle);
        bind('btn-timer-finish', 'click', Timer.finish);
        
        bind('btn-fab-fixed', 'click', () => {
             openActionMenu(null); 
        });

        bind('btn-reset-all', 'click', async () => {
            if (confirm('【警告】\nすべてのデータを削除して初期化しますか？\nこの操作は取り消せません。')) {
                if (confirm('本当に削除しますか？\n(復元用のバックアップがない場合、データは永遠に失われます)')) {
                    try {
                        if (db.logs) await db.logs.clear();
                        if (db.checks) await db.checks.clear();
                        if (db.period_archives) await db.period_archives.clear();
                        
                        localStorage.clear();
                        
                        alert('データを削除しました。アプリを再読み込みします。');
                        window.location.reload();
                    } catch (e) {
                        console.error(e);
                        alert('削除中にエラーが発生しました。\n' + e.message);
                    }
                }
            }
        });

        applyTheme(Store.getTheme());
    },

    switchTab: (tabId) => {
        if (tabId !== 'cellar') {
            StateManager.setIsEditMode(false);
            const deleteBtn = document.getElementById('btn-delete-selected');
            if (deleteBtn) deleteBtn.classList.add('translate-y-20', 'opacity-0');
        }

        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none'; 
        });

        const target = document.getElementById(`tab-${tabId}`);
        if(target) {
            target.style.display = 'block';
            setTimeout(() => {
                window.scrollTo(0, 0);
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
                target.classList.add('active');
            }, 10);
        }

        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('nav-pill-active'); 
            el.classList.add('p-3', 'hover:bg-base-100', 'dark:hover:bg-base-800', 'text-gray-400');
            const icon = el.querySelector('i');
            if(icon) icon.className = icon.className.replace('ph-fill', 'ph-bold'); 
        });

        const activeNav = document.getElementById(`nav-tab-${tabId}`);
        if(activeNav) {
            activeNav.classList.remove('p-3', 'hover:bg-base-100', 'dark:hover:bg-base-800', 'text-gray-400');
            activeNav.classList.add('nav-pill-active');
            const icon = activeNav.querySelector('i');
            if(icon) icon.className = icon.className.replace('ph-bold', 'ph-fill');
        }

        if (tabId === 'cellar') {
            updateLogListView(false); 
            UI.switchCellarView(StateManager.cellarViewMode || 'logs');
        } else if (tabId === 'home') {
            refreshUI();
        } else if (tabId === 'settings') {
            Settings.render(); // ★変更
        }
    },

    switchCellarView: (mode) => {
        StateManager.setCellarViewMode(mode);
        ['logs', 'stats', 'archives'].forEach(m => {
            const el = document.getElementById(`view-cellar-${m}`);
            const btn = document.getElementById(`btn-cellar-${m}`);
            if (el) el.classList.add('hidden');
            if (btn) {
                if (m === mode) {
                    btn.classList.add('bg-white', 'dark:bg-gray-700', 'text-indigo-600', 'dark:text-indigo-300', 'shadow-sm');
                    btn.classList.remove('text-gray-500', 'dark:text-gray-400', 'hover:bg-gray-200');
                } else {
                    btn.classList.remove('bg-white', 'dark:bg-gray-700', 'text-indigo-600', 'dark:text-indigo-300', 'shadow-sm');
                    btn.classList.add('text-gray-500', 'dark:text-gray-400', 'hover:bg-gray-200');
                }
            }
        });

        const activeEl = document.getElementById(`view-cellar-${mode}`);
        if (activeEl) {
            activeEl.classList.remove('hidden');
            (async () => {
                if (mode === 'stats') {
                    const { logs: periodLogs } = await Service.getAllDataForUI();
                    const allLogs = await db.logs.toArray();
                    renderBeerStats(periodLogs, allLogs);
                } else if (mode === 'archives') {
                    renderArchives();
                }
            })();
        }
    },

    toggleTheme: () => {
        const current = localStorage.getItem(APP.STORAGE_KEYS.THEME) || 'system';
        const next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem(APP.STORAGE_KEYS.THEME, next);
        applyTheme(next);
    },
    
    deleteLog: (id) => Service.deleteLog(id),
    editLog: async (id) => {
        if (StateManager.isEditMode) return;

        const log = await db.logs.get(id);
        if(!log) return;
        
        if(log.type === 'beer') {
            openBeerModal(null, dayjs(log.timestamp).format('YYYY-MM-DD'), log);
        } else if(log.type === 'exercise') {
            openManualInput(null, log);
        }
    },

    updateBulkCount: updateBulkCount,
    
    openBeerModal,
    openCheckModal,
    openManualInput,
    openHelp,
    closeModal,
    adjustBeerCount,
    toggleEditMode,
    toggleSelectAll,
    switchCellarViewHTML: (mode) => UI.switchCellarView(mode),
    
    openTimer,
    closeTimer,
    refreshUI,
    
    showConfetti,
    showMessage,
    
    openActionMenu,
    handleActionSelect,
    
    updateModeSelector,
    applyTheme,
    toggleDryDay,

    // ★追加: 新機能・設定用
    renderSettings: Settings.render,
    handleSaveSettings: Settings.save,
    openCheckLibrary,
    applyPreset,
    applyLibraryChanges,

// ★追加: 外部ファイルが直接インポートするための名前付きエクスポートを兼ねる
    // UIオブジェクト自体にメソッドを持たせる
    updateBeerSelectOptions
};

// ★追加: 外部モジュール（DataManagerなど）が import { updateBeerSelectOptions } from './ui/index.js' できるようにする
export { updateBeerSelectOptions, toggleModal };