import { Calc } from '../logic.js';
import { Store, db } from '../store.js';
import { Service } from '../service.js';
import { APP, CHECK_SCHEMA } from '../constants.js';
import { DOM, toggleModal, showConfetti, showToastAnimation, showMessage, applyTheme, toggleDryDay, initTheme, Feedback } from './dom.js';
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

import { 
    getBeerFormData, updateBeerKcalPreview, resetBeerForm, openBeerModal, switchBeerInputTab, 
    openCheckModal, openManualInput, renderSettings, openHelp, openLogDetail, 
    updateModeSelector, updateBeerSelectOptions, updateInputSuggestions, renderQuickButtons,
    closeModal, adjustBeerCount, searchUntappd,
    openTimer, closeTimer,
    openActionMenu, handleActionSelect,
    validateInput, openDayDetail as _originalOpenDayDetail
} from './modal.js';

import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const refreshUI = async () => {
    try {
        if (!DOM.isInitialized) DOM.init();

        // ★Serviceから「期間内(logs)」と「全部(allLogs)」を同時にもらう
        const { logs, checks: rawChecks, allLogs } = await Service.getAllDataForUI();

        // ★重要: 重複チェックデータの排除ロジックを追加
        // 同じ日付が複数ある場合、isSaved: true のものを最優先で1件だけ残す
        const checks = Object.values(rawChecks.reduce((acc, cur) => {
            const dateStr = dayjs(cur.timestamp).format('YYYY-MM-DD');
            // まだその日のデータがない、または「既存が未保存」で「今回が保存済み」なら上書き
            if (!acc[dateStr] || (!acc[dateStr].isSaved && cur.isSaved)) {
                acc[dateStr] = cur;
            }
            return acc;
        }, {}));
        
        // バランス計算 (全ログ対象)
        const profile = Store.getProfile();
        let balance = 0;
        logs.forEach(l => {
            // カロリーが記録されていればそれを使い、なければ計算
            const val = l.kcal !== undefined ? l.kcal : (l.type === 'exercise' ? (l.minutes * Calc.burnRate(6.0, profile)) : 0);
            balance += val;
        });
        
        // 各コンポーネント再描画 (全データを渡す)
        renderBeerTank(balance);
        renderLiverRank(checks, allLogs);
        renderCheckStatus(checks, logs);
        
        // 週間カレンダーは今週分(logs)、ヒートマップは全期間(allLogs)を渡す
        await renderWeeklyAndHeatUp(logs, checks);
        
        renderChart(allLogs, checks);
        
        // タブごとの個別更新処理
        const cellarMode = StateManager.cellarViewMode;
        if (cellarMode === 'logs') {
            if (typeof updateLogListView === 'function') {
                updateLogListView(); 
            }
        } else if (cellarMode === 'stats') {
            // ★修正: 第2引数に全期間ログ (allLogs) を渡す
            // これで "No Data" にならず、即座にグラフが更新されます
            renderBeerStats(logs, allLogs);
        } else if (cellarMode === 'archives') {
            renderArchives();
        }

        updateModeSelector(); 

    } catch (e) {
        console.error('UI Refresh Error:', e);
    }
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

        // ▼▼▼ 修正ここから (IDは header-mode-select のまま) ▼▼▼
        
        // 1. 変更イベント（ロジック更新 ＋ 見た目の文字更新）
        bind('header-mode-select', 'change', (e) => {
            // 既存のロジック
            StateManager.setBeerMode(e.target.value);
            refreshUI();

            // ★追加: 表示用の文字(beer-select-display)を更新
            const display = document.getElementById('beer-select-display');
            const selectedOption = e.target.options[e.target.selectedIndex];
            if (display && selectedOption) {
                display.textContent = selectedOption.text;
            }
        });

        // 2. 初期化処理（初期値セット ＋ 見た目の文字更新）
        const modes = Store.getModes();
        const headerSel = document.getElementById('header-mode-select');
        
        if(headerSel && modes) {
            headerSel.options[0].text = modes.mode1 || 'Lager';
            headerSel.options[1].text = modes.mode2 || 'Ale';
            headerSel.value = StateManager.beerMode;

            // ★追加: 初期表示の文字も更新
            const display = document.getElementById('beer-select-display');
            const selectedOption = headerSel.options[headerSel.selectedIndex];
            if (display && selectedOption) {
                display.textContent = selectedOption.text;
            }
        }

        bind('btn-save-beer', 'click', () => {
    // ★修正: 編集モード（IDがあるか）をチェック
    const isEdit = !!document.getElementById('editing-log-id').value;

    const dateEl = document.getElementById('beer-date');
    if (!dateEl || !dateEl.value) {
        showMessage('日付を選択してください', 'error');
        return;
    }

    // ★追加: 常にタップ音を出す
    Feedback.tap();

    const data = getBeerFormData();
    const event = new CustomEvent('save-beer', { detail: data });
    document.dispatchEvent(event);

    // ★追加: 新規登録の時だけお祝い演出を実行
    if (!isEdit) {
        UI.showConfetti();
        UI.showToastAnimation('beer');
        Feedback.beer();
    }

    toggleModal('beer-modal', false);
});

        // 保存して次へ
        bind('btn-save-beer-next', 'click', () => {
            Feedback.tap();
            const data = getBeerFormData();
            const event = new CustomEvent('save-beer', { detail: data });
            document.dispatchEvent(event);
            // ★修正: 更新(IDあり)のときは静かなメッセージにする
            const isEdit = !!document.getElementById('editing-log-id').value;
            showMessage(
                isEdit ? '更新しました！次にいきましょう。' : '! 記録しました！次にいきましょう。', 
                isEdit ? 'info' : 'success'
            );
            resetBeerForm(true); // 日付維持
            const container = document.querySelector('#beer-modal .overflow-y-auto');
            if(container) container.scrollTop = 0;
        });
        
        bind('btn-search-untappd', 'click', searchUntappd);

        // 🍺 ビールの削除ボタン
        bind('btn-delete-beer', 'click', async () => {
            const idVal = document.getElementById('editing-log-id').value;
            if (!idVal) return;

            if (!confirm('このビール記録を削除しますか？')) return;

            try {
                // 削除実行
                await Service.deleteLog(parseInt(idVal));
                
                // 音を鳴らす
                Feedback.delete();
                
                // 画面を更新して閉じる
                toggleModal('beer-modal', false);
                await refreshUI();
            } catch (e) { console.error(e); }
        });

        // --- 運動の保存処理 ---
    /* ui/index.js 内の運動保存イベント */

bind('btn-save-exercise', 'click', async () => {
    // --- 1. IDの取得と判定タグの作成 ---
    const idField = document.getElementById('editing-exercise-id');
    const editId = idField && idField.value ? parseInt(idField.value) : null;
    const isEdit = !!editId; // IDがあれば編集モード

    // ★追加: ボタンを押した瞬間のタップ音（いつでも鳴らす）
    Feedback.tap();

    const date = document.getElementById('manual-date').value;
    const minutes = parseInt(document.getElementById('manual-minutes').value, 10);
    const key = document.getElementById('exercise-select').value;
    
    const bonusEl = document.getElementById('manual-apply-bonus');
    const applyBonus = bonusEl ? bonusEl.checked : true;

    // --- 2. バリデーション ---
    if (!date || isNaN(minutes)) {
        showMessage('日付と時間を入力してください', 'error');
        return;
    }

    if (!validateInput(date, minutes)) {
        return;
    }

    // --- 3. 演出の実行（新規の時だけ） ---
    if (!isEdit) {
        // ★新規登録の時だけ、盛大にお祝いする
        UI.showConfetti();
        UI.showToastAnimation('exercise');
        Feedback.success(); // または Feedback.exercise()
    } else {
        // ★更新の時は、静かなメッセージを出す（任意）
        showMessage('📝 運動記録を更新しました', 'info');
    }

    // --- 4. 保存処理の発火 ---
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

        document.dispatchEvent(new CustomEvent('save-exercise', { detail }));
        
        // ★修正点2: 今回は「モーダル」なので、保存後に閉じる必要があります
        closeModal('exercise-modal');
    });

        // ★ここに追加: 運動の削除ボタンの処理
        bind('btn-delete-exercise', 'click', async () => {
            const idVal = document.getElementById('editing-exercise-id').value;
            
            // IDがない（新規作成時など）場合は何もしない
            if (!idVal) return;
            if (!confirm('この運動記録を削除しますか？')) return;

                // Service.deleteLog は削除後に自動で refresh-ui を発行します
                await Service.deleteLog(parseInt(idVal));

            Feedback.delete();
                
                // モーダルを閉じる
                closeModal('exercise-modal');
        });

        bind('btn-save-check', 'click', () => {
            const date = document.getElementById('check-date').value;
            const isDryDay = document.getElementById('check-is-dry').checked;
            const weight = document.getElementById('check-weight').value;
            
            // ★追加: 動的スキーマから値を取得
            let schema = CHECK_SCHEMA;
            try {
                const stored = localStorage.getItem(APP.STORAGE_KEYS.CHECK_SCHEMA);
                if (stored) schema = JSON.parse(stored);
            } catch(e) {}

            // 基本データ
            const detail = { date, isDryDay, weight, isSaved: true };

            // 動的データの収集
            schema.forEach(item => {
                const el = document.getElementById(`check-${item.id}`);
                detail[item.id] = el ? el.checked : false;
            });

            document.dispatchEvent(new CustomEvent('save-check', { detail }));
            toggleModal('check-modal', false);
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
        
        bind('btn-fab-fixed', 'click', () => {
             openActionMenu(null); 
        });

        // 全データ削除 (Danger Zone)
        bind('btn-reset-all', 'click', async () => {
            if (confirm('【警告】\nすべてのデータを削除して初期化しますか？\nこの操作は取り消せません。')) {
                if (confirm('本当に削除しますか？\n(復元用のバックアップがない場合、データは永遠に失われます)')) {
                    try {
                        // テーブルが存在する場合のみ削除を実行 (エラー回避)
                        if (db.logs) await db.logs.clear();
                        if (db.checks) await db.checks.clear();
                        if (db.period_archives) await db.period_archives.clear();
                        
                        // ローカルストレージ（設定）クリア
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

        // Service層などから 'refresh-ui' イベントが飛んできた時に、画面全体を再描画する
        document.addEventListener('refresh-ui', () => {
            // データベースの更新完了と描画タイミングの衝突を防ぐため、ごくわずかに遅らせる
            setTimeout(() => {
                // 現在ホームタブが開いている場合のみ、または全タブ更新
                refreshUI(); 
            }, 50);
        });

        initTheme();
    },

    switchTab: (tabId) => {
        // 1. Cellar以外のタブへ行くときは、編集モードを強制解除してUIを隠す
        if (tabId !== 'cellar') {
            StateManager.setIsEditMode(false);
            // ★追加: 削除ボタンを即座に隠す（チラつき防止）
            const deleteBtn = document.getElementById('btn-delete-selected');
            if (deleteBtn) deleteBtn.classList.add('translate-y-20', 'opacity-0');
        }

        // 2. 表示の切り替え
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none'; 
        });

        const target = document.getElementById(`tab-${tabId}`);
        if(target) {
            target.style.display = 'block';
            
            // ★修正: 10ミリ秒だけ待ってからスクロールすることで、確実に最上部に戻ります
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
            renderSettings(); 
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
                    // ★ここを修正
                    // 1. 現在の期間（今週/月）のデータを取得
                    const { logs: periodLogs } = await Service.getAllDataForUI();
                    // 2. データベースから全てのメインログを取得
                    const allLogs = await db.logs.toArray();
                    
                    // 両方を渡して描画
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
        
        // 編集モード確認は不要（タップで編集、長押し選択のUXの場合）
        // ここでは即編集モーダルへ
        if(log.type === 'beer') {
            openBeerModal(null, dayjs(log.timestamp).format('YYYY-MM-DD'), log);
        } else if(log.type === 'exercise') {
            // ★修正: 第2引数に log を渡して、編集モードで開く
            openManualInput(null, log);
        }
    },

    updateBulkCount: updateBulkCount,
    
    // ★追加: プレビュー更新関数をUIオブジェクトに紐づけ
    updateBeerKcalPreview: updateBeerKcalPreview,
 
    openBeerModal: (e, d) => openBeerModal(e, d),
    openCheckModal: openCheckModal,
    openManualInput: openManualInput,
    renderSettings: renderSettings, 
    openHelp: openHelp,
    closeModal: closeModal,
    adjustBeerCount: adjustBeerCount,
    toggleEditMode: toggleEditMode,
    toggleSelectAll: toggleSelectAll,
    switchCellarViewHTML: (mode) => UI.switchCellarView(mode),
    
    openTimer: openTimer,
    closeTimer: closeTimer,
    refreshUI: refreshUI,

    showConfetti: showConfetti,
    showMessage: showMessage,
    showToastAnimation: showToastAnimation, 
    openActionMenu: openActionMenu,
    handleActionSelect: handleActionSelect,
    
    // ★追加: これがないとDataManagerからの呼び出しでエラーになる
    updateModeSelector: updateModeSelector,
    applyTheme: applyTheme,
    toggleDryDay: toggleDryDay,
    // ★カレンダー/ヒートマップクリック時の詳細表示を「全期間対応」にする
    openDayDetail: async (date) => {
        // 1. Serviceから全データを取得
        const { allLogs } = await Service.getAllDataForUI();
        
        // 2. クリックされた日付のログを全データから抽出
        const targetDateStr = dayjs(date).format('YYYY-MM-DD');
        const dayLogs = allLogs.filter(log => 
            dayjs(log.timestamp).format('YYYY-MM-DD') === targetDateStr
        );

        // 3. modal.jsから読み込んだ元の関数に、抽出したデータを渡す
        _originalOpenDayDetail(date, dayLogs);
    },

};

export { 
    renderBeerTank, 
    renderLiverRank, 
    renderCheckStatus, 
    renderWeeklyAndHeatUp, 
    renderChart, 
    updateLogListView, 
    updateModeSelector, 
    updateBeerSelectOptions,
    StateManager,
    toggleModal
};














