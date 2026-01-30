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
import { Share } from './share.js';

import { 
    openBeerModal, openCheckModal, openManualInput, renderSettings, openHelp, openLogDetail, 
    updateModeSelector, renderQuickButtons, closeModal,
    openTimer, closeTimer,
    openActionMenu, handleSaveSettings, 
    validateInput, openDayDetail as _originalOpenDayDetail, handleRolloverAction,
    renderRecordTabShortcuts, // ★新規追加
    openShareModal // ★新規追加
} from './modal.js';
import {
    getBeerFormData,
    updateBeerKcalPreview,
    resetBeerForm,
    switchBeerInputTab,
    updateBeerSelectOptions,
    updateInputSuggestions,
    adjustBeerCount,
    searchUntappd
} from './beerForm.js';

import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

window.Service = Service;

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

        await renderRecordTabShortcuts();
        
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
        // ★追加: 二重初期化（イベントの二重登録）を防ぐガード
        if (UI.isInitialized) return;
        
        DOM.init();
        
        // ▼▼▼ ここから追加 ▼▼▼
        // ★修正: 固定要素がアニメーションでチラつかないようにCSS設定を注入
        const style = document.createElement('style');
        style.textContent = `
            header { view-transition-name: app-header; }
            nav { view-transition-name: app-nav; }
            #btn-fab-fixed { view-transition-name: app-fab; }
        `;
        document.head.appendChild(style);
        // ▲▲▲ ここまで追加 ▲▲▲
        
        const bind = (id, event, fn) => {
            const el = document.getElementById(id);
            if(el) el.addEventListener(event, fn);
        };

        bind('nav-tab-home', 'click', () => UI.switchTab('home'));
        bind('nav-tab-record', 'click', () => UI.switchTab('record'));
        bind('nav-tab-cellar', 'click', () => UI.switchTab('cellar'));
        bind('nav-tab-settings', 'click', () => UI.switchTab('settings'));

        // 🍺 ビール保存
        document.addEventListener('save-beer', async (e) => {
            const data = e.detail;
            const idField = document.getElementById('editing-log-id');
            const existingId = idField && idField.value ? parseInt(idField.value) : null;

            // 保存実行
            await Service.saveBeerLog(data, existingId);
            
            // 演出：新規登録時のみ豪華に（更新時は控えめに）
            if (!existingId) {
                Feedback.beer();
                showConfetti();
                showToastAnimation();
            } else {
                Feedback.tap();
            }

            // Untappd連携 (UI側の責任としてここで行う)
            if (data.useUntappd) {
                const query = encodeURIComponent(`${data.brewery || ''} ${data.brand || ''}`.trim());
                if(query) setTimeout(() => window.open(`https://untappd.com/search?q=${query}`, '_blank'), 100);
            }

            await refreshUI();
        });

        // 🏃 運動保存
        document.addEventListener('save-exercise', async (e) => {
            const { exerciseKey, minutes, date, applyBonus, id } = e.detail;
            
            try {
                await Service.saveExerciseLog(exerciseKey, minutes, date, applyBonus, id);
                
                // 演出
                if (!id) {
                    Feedback.success();
                    showConfetti();
                } else {
                    Feedback.tap();
                }

                // UIの後処理
                toggleModal('exercise-modal', false);
                const editIdField = document.getElementById('editing-exercise-id');
                if(editIdField) editIdField.value = '';

                await refreshUI();
            } catch(err) {
                console.error(err);
                showMessage('運動の記録に失敗しました', 'error');
            }
        });

        // ✅ デイリーチェック保存
        document.addEventListener('save-check', async (e) => {
            await Service.saveDailyCheck(e.detail);
            Feedback.success();
            await refreshUI();
        });

        // 🗑️ 一括削除
        document.addEventListener('bulk-delete', async () => {
            const checkboxes = document.querySelectorAll('.log-checkbox:checked');
            const ids = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));
            if (ids.length > 0) {
                await Service.bulkDeleteLogs(ids);
                Feedback.delete();
                await refreshUI();
            } else {
                UI.toggleEditMode();
            }
        });

        // 🔄 期間リセット同期
        document.addEventListener('confirm-rollover', async () => {
            toggleModal('rollover-modal', false);
            await refreshUI();
            showConfetti();
        });
        
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
                
                // 画面を更新して閉じる
                toggleModal('beer-modal', false);
                await refreshUI();
            } catch (e) { console.error(e); }
        });

        // --- 運動の保存処理 ---
        bind('btn-save-exercise', 'click', async () => {
            // 1. IDの取得
            const idField = document.getElementById('editing-exercise-id');
            const editId = idField && idField.value ? parseInt(idField.value) : null;
            const isEdit = !!editId;

            const date = document.getElementById('manual-date').value;
            const minutesInput = document.getElementById('manual-minutes').value;
            const minutes = parseInt(minutesInput, 10);
            const key = document.getElementById('exercise-select').value;
            
            const bonusEl = document.getElementById('manual-apply-bonus');
            const applyBonus = bonusEl ? bonusEl.checked : true;

            // 2. バリデーション
            if (!date || isNaN(minutes) || minutes <= 0) {
                Feedback.error(); // ★明示的にエラー音を鳴らす
                showMessage('日付と時間を正しく入力してください', 'error');
                return; // ここで終了。完了音へは行かない
            }

            // modal.js 側の詳細チェック
            if (!validateInput(date, minutes)) {
                // validateInput 内でエラー音が鳴るように修正(後述)
                return; 
            }

            // ▼▼▼ 追加: タイムスタンプ計算ロジック ▼▼▼
            const now = dayjs();
            const inputDate = dayjs(date);
            // 当日なら現在時刻、過去なら12:00
            const timestamp = inputDate.isSame(now, 'day')
                ? Date.now()
                : inputDate.startOf('day').add(12, 'hour').valueOf();
            // ▲▲▲ 追加ここまで ▲▲▲

            // 4. 保存イベント発火
            const detail = {
                exerciseKey: key,
                minutes: minutes,
                date: date,
                timestamp: timestamp,
                applyBonus: applyBonus,
                id: editId || null
            };

            document.dispatchEvent(new CustomEvent('save-exercise', { detail }));
            
            closeModal('exercise-modal');
        });

        // --- 運動の削除ボタン ---
        bind('btn-delete-exercise', 'click', async () => {
            const idVal = document.getElementById('editing-exercise-id').value;
            
            if (!idVal) return;
            if (!confirm('この運動記録を削除しますか？')) return;

            await Service.deleteLog(parseInt(idVal));
                
            closeModal('exercise-modal');
        });

        bind('btn-save-check', 'click', () => {
            // 判定用に「保存済みデータ」の存在をチェック（音の出し分け用）
            const isUpdate = document.getElementById('btn-save-check').textContent === 'Update Check';
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

// =========================================================
// 1. ビール本数調整 (二重音・重複発火対策)
// =========================================================
const btnBeerMinus = document.getElementById('btn-beer-minus');
const btnBeerPlus = document.getElementById('btn-beer-plus');

if (btnBeerMinus) {
    // pointerdown を使うことで、マウスとタッチの重複を防ぎ、反応速度も上がります
    btnBeerMinus.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // 重複イベント（clickなど）を防止
        adjustBeerCount(-1);
    });
}
if (btnBeerPlus) {
    btnBeerPlus.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // 重複イベント（clickなど）を防止
        adjustBeerCount(1);
    });
}

// =========================================================
// 2. デイリーチェック (音の追加)
// =========================================================

// A. 休肝日トグル (check-is-dry)
// スイッチ切り替え音 (uiSwitch)
const checkIsDry = document.getElementById('check-is-dry');
if (checkIsDry) {
    checkIsDry.addEventListener('change', () => {
        Feedback.uiSwitch(); // カチッ
        // toggleDryDay() は onchange="UI.toggleDryDay()" で呼ばれている可能性がありますが、
        // 音はここで鳴らすのが確実です。
    });
}

// B. その他のチェックボックス (動的生成対応)
// チェックリストの親要素に対してイベント委譲を設定します
const checkListContainer = document.getElementById('check-list-container'); // ※モーダル内のリスト親要素IDを確認
// もし親要素にIDがない場合は、モーダル全体('check-modal')から絞り込みます
const checkModal = document.getElementById('check-modal');

if (checkModal) {
    checkModal.addEventListener('change', (e) => {
        // 休肝日トグル以外で、チェックボックスが変更された場合
        if (e.target.type === 'checkbox' && e.target.id !== 'check-is-dry') {
            Feedback.tap(); // 軽いタップ音
        }
    });
}
        
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

        // ★追加: modal.js からの編集リクエストを受け取る
        document.addEventListener('request-edit-log', (e) => {
            UI.editLog(e.detail.id);
        });

        // ★追加: modal.js からの削除リクエストを受け取る
        document.addEventListener('request-delete-log', (e) => {
            UI.deleteLog(e.detail.id);
            if (typeof Feedback !== 'undefined' && Feedback.delete) Feedback.delete();
        });

        initTheme();

        // ★修正: FABの初期化 (hiddenを削除し、アニメーション用のクラスを付与)
        const fab = document.getElementById('btn-fab-fixed');
        if (fab) {
            fab.classList.remove('hidden');
            fab.classList.add('transition-all', 'duration-300', 'transform', 'ease-out');
            // 初期状態はHomeなので表示
            fab.classList.add('scale-100', 'opacity-100', 'pointer-events-auto');
            fab.classList.remove('scale-0', 'opacity-0', 'pointer-events-none');
        }

        window.handleRepeat = UI.handleRepeat;

        UI.isInitialized = true;
    },

    switchTab: (tabId) => {
        // 同じタブなら何もしない（誤操作防止）
        const currentTab = document.querySelector('.tab-content.active');
        if (currentTab && currentTab.id === `tab-${tabId}`) return;

        // ★ Phase 2: Reactive Transitions (View Transitions API)
        DOM.withTransition(() => {
            // Haptics (Phase 1)
            Feedback.uiSwitch();

            // ★修正: FAB (＋ボタン) の表示制御 (アニメーション版)
            const fab = document.getElementById('btn-fab-fixed');
            if (fab) {
                // Settings(保存ボタンと被る) と Record(画面自体がメニュー) では隠す
                // Home と Cellar では表示する
                const shouldShow = ['home', 'cellar'].includes(tabId);

                if (shouldShow) {
                    // 表示: 拡大して不透明に
                    fab.classList.remove('scale-0', 'opacity-0', 'pointer-events-none');
                    fab.classList.add('scale-100', 'opacity-100', 'pointer-events-auto');
                } else {
                    // 非表示: 縮小して透明に (DOMからは消さないのでチカチカしない)
                    fab.classList.remove('scale-100', 'opacity-100', 'pointer-events-auto');
                    fab.classList.add('scale-0', 'opacity-0', 'pointer-events-none');
                }
            }

            if (tabId !== 'cellar') {
                StateManager.setIsEditMode(false);
                const deleteBtn = document.getElementById('btn-delete-selected');
                if (deleteBtn) deleteBtn.classList.add('translate-y-20', 'opacity-0');
            }

            document.querySelectorAll('.tab-content').forEach(el => {
                el.classList.remove('active');
                el.style.viewTransitionName = ''; 
                el.style.display = 'none'; 
            });

            const target = document.getElementById(`tab-${tabId}`);
            if(target) {
                target.style.display = 'block';
                target.style.viewTransitionName = 'tab-content'; 
                
                setTimeout(() => {
                    window.scrollTo(0, 0); 
                    target.classList.add('active');
                }, 10);
            }

            document.querySelectorAll('.nav-item').forEach(el => {
                el.className = 'nav-item p-3 rounded-full hover:bg-base-100 dark:hover:bg-base-800 text-gray-400';
                const icon = el.querySelector('i');
                if(icon) icon.className = icon.className.replace('ph-fill', 'ph-bold'); 
            });

            const activeNav = document.getElementById(`nav-tab-${tabId}`);
            if(activeNav) {
                activeNav.className = 'nav-item nav-pill-active'; 
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
        });
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

    // ★追加: HTMLのonclick属性から呼べるように公開する
    openLogDetail: (id) => {
        // idからログデータを取得して詳細モーダルを開く
        db.logs.get(id).then(log => {
            if (log) openLogDetail(log);
        });
    },

    handleRepeat: async (log) => {
        try {
            // 1. 保存実行 (Serviceに委譲)
            await Service.repeatLog(log);
            
            // 3. UIリフレッシュ
            await refreshUI();
            
        } catch (e) {
            console.error('Repeat Error:', e);
            showMessage('登録に失敗しました', 'error');
        }
    },

    updateBulkCount: updateBulkCount,
    
    // ★追加: プレビュー更新関数をUIオブジェクトに紐づけ
    updateBeerKcalPreview: updateBeerKcalPreview,
 
    openBeerModal: (e, d) => openBeerModal(e, d),
    openCheckModal: openCheckModal,
    openManualInput: openManualInput,
    renderRecordTabShortcuts: renderRecordTabShortcuts,
    openShareModal: openShareModal,
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
    updateModeSelector: updateModeSelector,
    applyTheme: applyTheme,
    toggleDryDay: toggleDryDay,

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
          
    handleRolloverAction: handleRolloverAction, 
    handleSaveSettings: handleSaveSettings,
    share: Share.generateAndShare,

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


