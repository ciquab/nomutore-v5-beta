// @ts-check
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { Service } from '../service.js';
import { APP, CHECK_SCHEMA } from '../constants.js';
import { DOM, AudioEngine, toggleModal, showConfetti, showToastAnimation, showMessage, applyTheme, toggleDryDay, initTheme, Feedback, showUpdateNotification, showAppShell } from './dom.js';
import { StateManager } from './state.js';
import { EventBus, Events } from '../eventBus.js';

import { renderBeerTank } from './beerTank.js';
import { renderLiverRank } from './liverRank.js';
import { renderCheckStatus } from './checkStatus.js';
import { renderAlcoholMeter } from './alcoholMeter.js';
import { renderWeeklyAndHeatUp, renderHeatmap } from './weekly.js';
import { renderChart } from './chart.js';
import { updateLogListView, toggleEditMode, toggleSelectAll, updateBulkCount, setFetchLogsHandler, deleteSelectedLogs } from './logList.js';
import { renderBeerStats, renderBeerCollection } from './beerStats.js';
import { renderArchives } from './archiveManager.js';
import { Timer } from './timer.js';
import { Share } from './share.js';
import { handleRollover } from './rollover.js';

import {
    renderSettings, openHelp,
    updateModeSelector, renderQuickButtons, closeModal,
    openTimer, closeTimer,
    openActionMenu, handleSaveSettings,
    validateInput,
    renderRecordTabShortcuts,
    openShareModal,
    showRolloverModal,
    generateSettingsOptions,
    updateActionMenuContent
} from './modal.js';
import {
    openBeerModal,
    getBeerFormData,
    updateBeerKcalPreview,
    resetBeerForm,
    switchBeerInputTab,
    updateBeerSelectOptions,
    updateInputSuggestions,
    adjustBeerCount,
    searchUntappd
} from './beerForm.js';
import { getExerciseFormData, openManualInput } from './exerciseForm.js';
import { renderCheckEditor, openCheckModal, getCheckFormData,
         renderCheckLibrary, openCheckLibrary,
         applyLibraryChanges,
         applyPreset,
         deleteCheckItem,
         addNewCheckItem,
         handleCheckDateChange, handleDryDayToggle, handleLibraryItemToggle } from './checkForm.js';
import * as LogDetail from './logDetail.js';
import { setupGlobalListeners } from './gestures.js';
import { DataManager } from '../dataManager.js';

import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

let fabEl = null;
let saveEl = null;

/**
 * EventBus リスナーの一括登録
 * データ層・サービス層からの通知を受け取り、UI を更新する。
 * UI.init() の中で一度だけ呼ばれる。
 */
const setupEventBusListeners = () => {
    // 1. 汎用メッセージ通知 (DataManager等から)
    EventBus.on(Events.NOTIFY, ({ message, type, action }) => {
        showMessage(message, type || 'info', action || null);
    });

    // 2. クラウド同期ステータス更新
    EventBus.on(Events.CLOUD_STATUS, ({ message }) => {
        const el = document.getElementById('cloud-status');
        if (el) el.textContent = message;
    });

    // 3. グローバルエラー表示
    EventBus.on(Events.ERROR_SHOW, ({ errText }) => {
        const overlay = document.getElementById('global-error-overlay');
        const details = document.getElementById('error-details');
        if (overlay && details) {
            details.textContent = errText;
            overlay.classList.remove('hidden');

            const copyBtn = document.getElementById('btn-copy-error');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(errText)
                        .then(() => alert('エラーログをコピーしました'))
                        .catch(() => alert('コピーに失敗しました'));
                });
            }
        }
    });

    // 4. UI 更新リクエスト (rollover.js 等から)
    EventBus.on(Events.REFRESH_UI, () => {
        setTimeout(() => refreshUI(), 50);
    });

    // 5. 設定画面の期間モード変更 (rollover.js から)
    EventBus.on(Events.SETTINGS_APPLY_PERIOD, ({ mode }) => {
        const pMode = document.getElementById('setting-period-mode');
        if (pMode) {
            pMode.value = mode;
            pMode.dispatchEvent(new Event('change'));
        }
    });

    // 6. データ復元後のテーマ再適用
    EventBus.on(Events.STATE_CHANGE, ({ key, value }) => {
        if (key === 'themeRestored') {
            applyTheme(value);
            if (typeof updateModeSelector === 'function') updateModeSelector();
        }
    });
};

// Homeタブの描画スキップ用キャッシュ（データ未変更時に重い再描画を抑制）
let _lastHomeRenderKey = '';
// ★追加: データ変更検知用のキャッシュ（ショートカット再生成の抑制用）
let _lastDataFingerprint = '';
let _lastCellarRenderKey = ''; 

// Cellarサブビュー切替の共通ヘルパー（DOMの表示切替のみ）
const _applyCellarSubView = (mode) => {
    ['logs', 'stats', 'collection', 'archives'].forEach(m => {
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
    if (activeEl) activeEl.classList.remove('hidden');
};

// ★引数 (forcedTabId) を追加
export const refreshUI = async (forcedTabId = null) => {
    try {
        if (!DOM.isInitialized) DOM.init();

        // 1. Serviceからデータを取得
        const { logs, checks, allLogs, balance } = await Service.getAppDataSnapshot();

        UI._statsData.periodLogs = logs;
        UI._statsData.allLogs = allLogs;
        UI._statsData.checks = checks;
      
        // データの「指紋（Fingerprint）」を作成して、変更があるかチェック
        // (ログ件数、カロリー収支、チェック数 のどれかが変わっていれば変更とみなす)
        const currentFingerprint = `${allLogs.length}:${balance.toFixed(1)}:${checks.length}`;

        if (currentFingerprint !== _lastDataFingerprint) {
            _lastDataFingerprint = currentFingerprint;
            
            // データが変わった時だけ、裏側のボタン類を作り直す（これで無駄な処理が減る）
            renderRecordTabShortcuts(); 
            updateActionMenuContent(); 
        }
        
        // 2. --- アクティブなタブに応じた描画の振り分け ---
        // 引数で指定があればそれを優先、なければDOMから探す
        let activeTabId = forcedTabId;
        if (!activeTabId) {
            const activeTabEl = document.querySelector('.tab-content.active');
            activeTabId = activeTabEl ? activeTabEl.id.replace('tab-', '') : 'home';
        }

        if (activeTabId === 'home') {
            // 軽量・即時反映系
            renderBeerTank(balance, logs);
            renderLiverRank(checks, allLogs);
            renderCheckStatus(checks, logs);
            renderAlcoholMeter(allLogs);

            // 重量・キャッシュ系
            const currentTheme = localStorage.getItem(APP.STORAGE_KEYS.THEME) || 'system';
            const renderKey = `${allLogs.length}:${logs.length}:${balance}:${checks.length}:${currentTheme}`;
            
            if (renderKey !== _lastHomeRenderKey) {
                _lastHomeRenderKey = renderKey;
                renderWeeklyAndHeatUp(allLogs, checks);
                renderChart(allLogs, checks);
            }
        }

        else if (activeTabId === 'record') {
            // ★修正: データ変更時に（上のフィンガープリント判定ブロックで）
            // 既に作成されているため、ここでは何もしなくてOKです。
            // これでタブ切り替えが一瞬になります。
        }
        else if (activeTabId === 'cellar') {
            // ★修正: データまたは表示モードが変わった時だけ再描画する
            const cellarMode = StateManager.cellarViewMode || 'logs';
            const cellarKey = `${currentFingerprint}:${cellarMode}`;

            if (cellarKey !== _lastCellarRenderKey) {
                _lastCellarRenderKey = cellarKey;

                if (cellarMode === 'logs') {
                    await updateLogListView(false, allLogs);
                } else if (cellarMode === 'stats') {
                    renderBeerStats(logs, allLogs, checks);
                } else if (cellarMode === 'collection') {
                    renderBeerCollection(logs, allLogs);
                } else if (cellarMode === 'archives') {
                    renderArchives();
                }
            }
        }
        else if (activeTabId === 'settings') {
            updateModeSelector();
        }

    } catch (e) {
        console.error('UI Refresh Error:', e);
    }
};

export const UI = {
    _statsData: {
    periodLogs: [],
    allLogs: []
    },

    setFetchLogsHandler: (fn) => { setFetchLogsHandler(fn); },
    _fetchAllDataHandler: null,
    setFetchAllDataHandler: (fn) => { UI._fetchAllDataHandler = fn; },

    init: () => {
        // ★追加: 二重初期化（イベントの二重登録）を防ぐガード
        if (UI.isInitialized) return;
        
        DOM.init();

        // ───── EventBus リスナー登録（単方向データフロー: Data層 → UI層） ─────
        setupEventBusListeners();

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

        // 🍺 ビール保存
        document.addEventListener('save-beer', async (e) => {
    const btn = document.getElementById('btn-save-beer');
    if (btn && btn.disabled) return;
    const { data, existingId } = e.detail;

    try {

        if (btn) {
            btn.disabled = true; // 処理開始時にロック
            btn.innerHTML = '<i class="ph-bold ph-circle-notch animate-spin"></i> 保存中...';
        }
        // 1. Serviceに保存を依頼し、結果を受け取る
        const result = await Service.saveBeerLog(data, existingId);
        
        if (result.success) {
            // 2. メッセージの組み立て
            let msg = "";
            if (result.isUpdate) {
                msg = '<i class="ph-bold ph-pencil-simple"></i> 記録を更新しました';
            } else {
                // 新規登録時のメッセージ構築
                const kcalText = Math.abs(result.kcal) > 500 
                    ? `${Math.round(Math.abs(result.kcal))}kcalの借金です` 
                    : '記録しました！';
                msg = `<i class="ph-fill ph-beer-bottle text-lg"></i> ${kcalText}`;
                
                // 休肝日解除の追記
                if (result.dryDayCanceled) {
                    msg += '<br><span class="text-xs font-bold opacity-80">※休肝日設定を解除しました</span>';
                }

                // 新規登録時の豪華な演出
                Feedback.beer();
                showConfetti();
                showToastAnimation();
            }

            // 3. メッセージを表示（シェアボタン等のアクションを添えて）
            // Serviceから返ってきた shareAction をそのまま渡します
            showMessage(msg, 'success', result.shareAction);

            // 4. Untappd連携（Serviceが生成したURLがあれば開く）
            if (result.untappdUrl) {
                setTimeout(() => window.open(result.untappdUrl, '_blank'), 100);
            }

            // 5. 画面の更新
            toggleModal('beer-modal', false);
            await refreshUI();
        }
    } catch (err) {
        console.error('Save Beer Error:', err);
        showMessage('保存中にエラーが発生しました', 'error');
        } finally {
        // 【重要】成功しても失敗しても必ずボタンを復帰させる
        if (btn) {
            btn.disabled = false;
            btn.textContent = '記録を保存';
        }
    }
});

       // 🏃 運動保存リスナーの修正案
document.addEventListener('save-exercise', async (e) => {
    const btn = document.getElementById('btn-save-exercise');
    if (btn && btn.disabled) return; // ガード
    const { exerciseKey, minutes, date, applyBonus, id } = e.detail;
    
    try {
         if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph-bold ph-circle-notch animate-spin"></i> 保存中...';
        }
        // 1. Serviceの実行結果を待つ
        const result = await Service.saveExerciseLog(exerciseKey, minutes, date, applyBonus, id);
        
        if (result.success) {
            // 2. メッセージの動的な組み立て
            let msg = "";
            if (result.isUpdate) {
                msg = '<i class="ph-bold ph-pencil-simple"></i> 記録を更新しました';
            } else {
                // 新規保存時の演出
                msg = `<i class="ph-fill ph-sneaker-move text-lg"></i> ${Math.round(result.kcal)}kcal 返済しました！`;
                
                // ボーナス適用時の追記
                if (result.bonusMultiplier > 1.0) {
                    msg += `<br><span class="text-[10px] font-bold opacity-80">Streak Bonus x${result.bonusMultiplier.toFixed(1)} 適用済み</span>`;
                }

                Feedback.success();
                showConfetti();
            }

            // 3. UIへのフィードバック
            showMessage(msg, 'success', result.shareAction);

            // 4. クリーンアップ処理
            toggleModal('exercise-modal', false);
            const editIdField = document.getElementById('editing-exercise-id');
            if(editIdField) editIdField.value = '';
            
            await refreshUI();
        }
    } catch(err) {
        console.error('Save Exercise Error:', err);
        showMessage('運動の記録に失敗しました', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '記録を保存';
        }
    }
});

        // ✅ デイリーチェック保存リスナー
document.addEventListener('save-check', async (e) => {
    try {
        const result = await Service.saveDailyCheck(e.detail);
        
        if (result.success) {
            // メッセージの決定
            const msg = result.isUpdate
                ? '✅ デイリーチェックを更新しました'
                : '✅ デイリーチェックを記録しました';

            // 演出の実行
            Feedback.success();
            showMessage(msg, 'success', result.shareAction);

            // 画面更新
            await refreshUI();
        }
    } catch (err) {
        console.error('Save Check Error:', err);
        showMessage('チェックの記録に失敗しました', 'error');
    }
});

        // 🗑️ 個別削除リクエストの処理
document.addEventListener('request-delete-log', async (e) => {
    try {
        const result = await Service.deleteLog(e.detail.id);
        
        if (result.success) {
            // 音の演出
            if (typeof Feedback !== 'undefined' && Feedback.delete) {
                Feedback.delete();
            }
            showMessage('削除しました', 'success');
            await refreshUI();
        }
    } catch (err) {
        console.error('Delete Error:', err);
        showMessage('削除に失敗しました', 'error');
    }
});

// 🗑️ 一括削除の処理
document.addEventListener('bulk-delete', async () => {
    const checkboxes = document.querySelectorAll('.log-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));

    if (ids.length === 0) return;

    try {
        // 先に音を鳴らす（UX向上：削除が重くても反応を即座に返す）
        if (typeof AudioEngine !== 'undefined') AudioEngine.resume();
        if (typeof Feedback !== 'undefined' && Feedback.delete) Feedback.delete();

        const result = await Service.bulkDeleteLogs(ids);

        if (result.success) {
            showMessage(`${result.count}件削除しました`, 'success');
            
            // 編集モードを閉じるなどのUI操作
            if (typeof UI.toggleEditMode === 'function') {
                UI.toggleEditMode();
            }
            await refreshUI();
        }
    } catch (err) {
        console.error('Bulk Delete Error:', err);
        showMessage('一括削除に失敗しました', 'error');
    }
});

        // 🔄 期間リセット同期
        document.addEventListener('confirm-rollover', async () => {
            toggleModal('rollover-modal', false);
            if (Timer && Timer.init) {
                Timer.init();
            }

            _lastHomeRenderKey = ''; // アーカイブ後のデータ変更を確実に反映
            UI.switchTab('home', { silent: true });
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

        bind('btn-save-beer', 'click', async () => {
    // 1. 編集モード（IDがあるか）をチェック
    const editIdVal = document.getElementById('editing-log-id').value;
    const editingId = editIdVal ? parseInt(editIdVal) : null;

    const dateEl = document.getElementById('beer-date');
    if (!dateEl || !dateEl.value) {
        showMessage('日付を選択してください', 'error');
        return;
    }

    // 常にタップ音を出す
    Feedback.tap();

    // 編集中の場合は、DBから元のログ情報を取得して getBeerFormData に渡す
    let existingLog = null;
    if (editingId) {
        existingLog = await Service.getLogById(editingId);
    }

    // 引数に既存ログを渡す（beerForm.js側の修正とセットで機能します）
    const data = getBeerFormData(existingLog); 

    // ★追加: データが null (バリデーションエラー) の場合は処理を中断
    if (!data) return;
    
    const event = new CustomEvent('save-beer', { 
        detail: { data, existingId: editingId } 
    });
    document.dispatchEvent(event);

    toggleModal('beer-modal', false);
});

        // 保存して次へ
        bind('btn-save-beer-next', 'click', async () => {
    const editIdVal = document.getElementById('editing-log-id').value;
    const editingId = editIdVal ? parseInt(editIdVal) : null;

    let existingLog = null;
    if (editingId) {
        existingLog = await Service.getLogById(editingId);
    }

    const data = getBeerFormData(existingLog);

    // ★追加: データが null (バリデーションエラー) の場合は処理を中断
    if (!data) return;
            
    const event = new CustomEvent('save-beer', { 
        detail: { data, existingId: editingId } 
    });
    document.dispatchEvent(event);

    const isEdit = !!editingId;
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
        bind('btn-delete-beer', 'click', () => {
    const idVal = document.getElementById('editing-log-id').value;
    if (!idVal) return;
    if (!confirm('このビール記録を削除しますか？')) return;

    document.dispatchEvent(new CustomEvent('request-delete-log', {
        detail: { id: parseInt(idVal) }
    }));

    toggleModal('beer-modal', false);
});

        // --- 運動の保存処理 ---
        bind('btn-save-exercise', 'click', async () => {
    try {
        // 1. フォーム担当者にデータを集めさせる
        const detail = getExerciseFormData();

        // ★追加: データが null (バリデーションエラー) の場合はここで処理を止める
        if (!detail) return;

        // 2. タップ音を鳴らす
        Feedback.tap();

        // 3. 「保存してくれ！」というイベントを発火するだけ
        document.dispatchEvent(new CustomEvent('save-exercise', { detail }));

        // 4. モーダルを閉じる
        closeModal('exercise-modal');

    } catch (err) {
        // バリデーションエラー等の失敗時
        Feedback.error();
        showMessage(err.message, 'error');
    }
});

        // --- 運動の削除ボタン ---
        bind('btn-delete-exercise', 'click', () => {
    const idVal = document.getElementById('editing-exercise-id').value;
    if (!idVal) return;
    if (!confirm('この運動記録を削除しますか？')) return;

    document.dispatchEvent(new CustomEvent('request-delete-log', {
        detail: { id: parseInt(idVal) }
    }));

    closeModal('exercise-modal'); // UI都合の処理だけここでOK
});

        bind('btn-save-check', 'click', () => {
    try {
        // 専門家（checkForm.js）にデータを集めてもらう
        const detail = getCheckFormData();

        // ★追加: データが null (バリデーションエラー) の場合はここで処理を止める
        if (!detail) return;
        
        // 常にタップ音を出す
        Feedback.tap();

        // 収集したデータをイベントで飛ばす
        document.dispatchEvent(new CustomEvent('save-check', { detail }));
        
        toggleModal('check-modal', false);
    } catch (e) {
        console.error('Check Form Data Collection Error:', e);
        showMessage('入力内容の取得に失敗しました', 'error');
    }
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
                        await Service.resetAllData();
                        
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
            _lastHomeRenderKey = ''; // EventBus版と同様にキャッシュを破棄
            setTimeout(() => {
                refreshUI();
            }, 50);
        });

        // ★追加: modal.js からの編集リクエストを受け取る
        document.addEventListener('request-edit-log', (e) => {
            UI.editLog(e.detail.id);
        });


        initTheme();

        // ===== FAB / Save DOMを一度だけ取得 =====
        fabEl  = document.getElementById('btn-fab-fixed');
        saveEl = document.getElementById('settings-save-container');
        
        // 初期状態：FAB方式で完全非表示
        [fabEl, saveEl].forEach(el => {
            if (!el) return;
            // transition-all がHTMLにあることを確認（なければ追加）
            if (!el.classList.contains('transition-all')) {
                el.classList.add('transition-all', 'duration-300', 'ease-out');
            }
    
            // ★重要: 初期状態は hidden のみ
            el.classList.add('hidden');
        });

        document.addEventListener('click', (e) => {
    const btn = e.target.closest('#btn-save-settings');
    if (!btn) return;
    handleSaveSettings();
});

        // --- ファイル入力の change ハンドラ ---
        // data-action では扱えないため個別にバインドする
        const importFileInput = document.getElementById('import-file');
        if (importFileInput) {
            importFileInput.addEventListener('change', function() {
                DataManager.importJSON(this);
            });
        }

        // --- グローバルジェスチャーリスナー（スワイプ・FABスクロール） ---
        setupGlobalListeners((tabId) => UI.switchTab(tabId));

                // --- ★追加: チェックライブラリの開閉を監視してSaveボタンを制御 ---
        const libModal = document.getElementById('check-library-modal');
        if (libModal) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'class') {
                        const isHidden = libModal.classList.contains('hidden');
                        const saveBtn = document.getElementById('settings-save-container');
                        
                        // 設定タブが開いている時だけ制御
                        const isSettingsTab = document.getElementById('tab-settings')?.classList.contains('active');

                        if (saveBtn && isSettingsTab) {
                            // モーダルが出ている(hiddenがない)ならボタンを隠す
                            // モーダルが隠れた(hiddenがある)ならボタンを出す
                            toggleFabLike(saveBtn, isHidden);
                        }
                    }
                });
            });
            observer.observe(libModal, { attributes: true });
        }
        
        UI.isInitialized = true;
    },
    
    switchTab: (tabId, options = { silent: false }) => {
        // View Transition 内は DOM 切替のみ（軽量）。データ取得・描画は後で行う。
        DOM.withTransition(() => {
            if (!options.silent) {
                Feedback.uiSwitch();
            }

            const onboarding = document.getElementById('onboarding-modal');
            const isOnboarding = onboarding && !onboarding.classList.contains('hidden');

            toggleFabLike(
                fabEl,
                ['home', 'cellar'].includes(tabId) && !isOnboarding
            );

            toggleFabLike(
                saveEl,
                tabId === 'settings' && !isOnboarding
            );

            document.querySelectorAll('.tab-content').forEach(el => {
                el.classList.remove('active');
                el.style.viewTransitionName = '';
                el.style.display = 'none';
            });

            const target = document.getElementById(`tab-${tabId}`);
            if (target) {
                target.style.display = 'block';
                target.style.viewTransitionName = 'tab-content';
                target.classList.add('active');

                requestAnimationFrame(() => {
                    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                    document.documentElement.scrollTop = 0;
                    document.body.scrollTop = 0;
                });
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

            if (tabId === 'settings') {
                renderSettings();
            }

            // Cellarタブ: サブビューのDOM切替のみ行う（refreshUIはTransition外で）
            if (tabId === 'cellar') {
                const mode = StateManager.cellarViewMode || 'logs';
                StateManager.setCellarViewMode(mode);
                _applyCellarSubView(mode);
            }
        });

        // データ取得・描画は View Transition の外で実行（アニメーションをブロックしない）
        requestAnimationFrame(() => refreshUI(tabId));
    },
    
    switchCellarView: (mode) => {
        if (typeof Feedback !== 'undefined') {
            Feedback.uiSwitch();
        }
        StateManager.setCellarViewMode(mode);
        _applyCellarSubView(mode);
        // DOM切替を先に描画してからデータ取得・描画を実行
        requestAnimationFrame(() => refreshUI());
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

        const log = await Service.getLogById(id);
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

    openLogDetail: async (id) => {
        Feedback.tap();
        const log = await Service.getLogById(parseInt(id));
        if (log) {
            // 「LogDetailファイルの openLogDetail を呼ぶ」と明確にわかる
            LogDetail.openLogDetail(log); 
        }
    },

    /**
     * リピート実行
     * 修正: 直接Serviceを呼ぶとUI演出(音/紙吹雪)がスキップされるため、
     * 既存のイベントリスナー(save-beer/save-exercise)を経由させる。
     */
    handleRepeat: async (log) => {
    try {
        if (log.type === 'beer') {
            document.dispatchEvent(new CustomEvent('save-beer', {
                detail: {
                    data: {
                        timestamp: Date.now(),
                        brewery: log.brewery || '',
                        brand: log.brand || '',
                        rating: log.rating || 0,
                        memo: log.memo || '',
                        style: log.style || '国産ピルスナー',
                        size: String(log.size || 350),
                        count: log.count || 1,
                        isCustom: log.isCustom || false,
                        userAbv: log.userAbv ?? NaN,
                        abv: log.abv ?? 5.0,
                        ml: log.ml ?? 350,
                        carb: log.carb ?? 3.0,
                        type: log.type ?? 'sweet',   // ★修正
                        useUntappd: false
                    },
                    existingId: null
                }
            }));
        }

        else if (log.type === 'exercise') {
            document.dispatchEvent(new CustomEvent('save-exercise', {
                detail: {
                    exerciseKey: log.exerciseKey,
                    minutes: log.minutes,
                    date: Date.now(),
                    applyBonus: true,
                    id: null
                }
            }));
        }

    } catch (e) {
        console.error('Repeat Error:', e);
        showMessage('登録に失敗しました', 'error');
    }
},
    /**
     * チャートの期間切り替え
     * @param {string} range '1w', '1m', '3m'
     */
    handleChartPeriod: (range) => {
        // 1. 状態を更新
        StateManager.setChartRange(range);
        
        // 2. 保存しておいたデータを使ってグラフだけ再描画
        const { allLogs, checks } = UI._statsData;
        if (allLogs && checks) {
            renderChart(allLogs, checks);
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

    openDayDetail: (date) => {
        // 「LogDetailファイルの openDayDetail を呼ぶ」
        LogDetail.openDayDetail(date);
    },
          
    triggerFileInput: (inputId) => {
        const el = document.getElementById(inputId);
        if (el) el.click();
    },
    enableInteractions: () => {
        document.body.style.pointerEvents = 'auto';
        setTimeout(() => {
            document.body.classList.remove('preload');
        }, 100);
    },
    handleSaveSettings: handleSaveSettings,
    share: Share.generateAndShare,
    get selectedDate() { return StateManager.selectedDate; },
    toggleModal: (id, show) => {
        if (show === undefined) {
            // showが省略された場合はトグル
            const el = document.getElementById(id);
            const isVisible = el && !el.classList.contains('hidden');
            toggleModal(id, !isVisible);
        } else {
            toggleModal(id, show);
        }
    },

    deleteSelectedLogs: deleteSelectedLogs,
    showRolloverModal: showRolloverModal,
    showUpdateNotification: showUpdateNotification,
    renderCheckLibrary: renderCheckLibrary,
    openCheckLibrary: openCheckLibrary,
    applyLibraryChanges: applyLibraryChanges,
    applyPreset: applyPreset,
    deleteCheckItem: deleteCheckItem,
    addNewCheckItem: addNewCheckItem,
    handleRollover: handleRollover,
    handleCheckDateChange: handleCheckDateChange,
    handleDryDayToggle: handleDryDayToggle, 
    handleLibraryItemToggle: handleLibraryItemToggle,

    
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
    generateSettingsOptions,
    StateManager,
    toggleModal
};

const toggleFabLike = (el, show) => {
    if (!el) return;

    if (show) {
        let delayMs = 0;
        if (el.id === 'settings-save-container') {
            delayMs = 400;
            const activeEl = document.activeElement;
            if (activeEl && typeof activeEl.blur === 'function') {
                activeEl.blur();
            }
        }

        el.dataset.animating = 'true';

        const startAnimation = () => {
            // ★修正: inline style をクリア（スクロール制御の影響を削除）
            el.style.removeProperty('transform');
            el.style.removeProperty('opacity');
            
            // 1. hidden を削除
            el.classList.remove('hidden');
            
            // 2. 初期状態を設定
            el.classList.add('scale-0', 'opacity-0', 'pointer-events-none');
            
            // 3. 強制リフロー
            void el.offsetHeight;
            
            // 4. アニメーション開始
            el.classList.remove('scale-0', 'opacity-0', 'pointer-events-none');
            el.classList.add('scale-100', 'opacity-100', 'pointer-events-auto');
            
            setTimeout(() => { delete el.dataset.animating; }, 350);
        };

        if (delayMs > 0) {
            setTimeout(startAnimation, delayMs);
        } else {
            startAnimation();
        }
    } else {
        if (el.id === 'settings-save-container') {
            el.classList.add('hidden');
            el.classList.remove('scale-100', 'opacity-100', 'pointer-events-auto');
            el.classList.add('scale-0', 'opacity-0', 'pointer-events-none');
            delete el.dataset.animating;
        } else {
            el.classList.remove('scale-100', 'opacity-100', 'pointer-events-auto');
            el.classList.add('scale-0', 'opacity-0', 'pointer-events-none');
            delete el.dataset.animating;
            setTimeout(() => { el.classList.add('hidden'); }, 300);
        }
    }
};

export const initHandleRepeatDelegation = () => {
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action="log:repeat"]');
        if (!target) return;
        
        try {
            const payload = JSON.parse(target.dataset.payload);
            UI.handleRepeat(payload);
            
            // オプション: 成功後のアクション
            const onSuccess = target.dataset.onSuccess;
            const onSuccessParam = target.dataset.onSuccessParam;
            if (onSuccess && onSuccessParam) {
                // 例: modal:close → toggleModal(param, false)
                if (onSuccess === 'modal:close') {
                    toggleModal(onSuccessParam, false);
                }
            }
        } catch (err) {
            console.error('[handleRepeat] Error:', err);
        }
    });
};







