import { Calc } from '../logic.js';
import { Store, db } from '../store.js';
import { Service } from '../service.js';
import { APP, CHECK_SCHEMA } from '../constants.js';
import { DOM, AudioEngine, toggleModal, showConfetti, showToastAnimation, showMessage, applyTheme, toggleDryDay, initTheme, Feedback, showUpdateNotification } from './dom.js';
import { StateManager } from './state.js';

import { renderBeerTank } from './beerTank.js';
import { renderLiverRank } from './liverRank.js';
import { renderCheckStatus } from './checkStatus.js';
import { renderWeeklyAndHeatUp, renderHeatmap } from './weekly.js';
import { renderChart } from './chart.js';
import { updateLogListView, toggleEditMode, toggleSelectAll, updateBulkCount, setFetchLogsHandler, deleteSelectedLogs } from './logList.js';
import { renderBeerStats } from './beerStats.js';
import { renderArchives } from './archiveManager.js';
import { Timer } from './timer.js';
import { Share } from './share.js';

import { 
    renderSettings, openHelp, 
    updateModeSelector, renderQuickButtons, closeModal,
    openTimer, closeTimer,
    openActionMenu, handleSaveSettings, 
    validateInput, handleRolloverAction,
    renderRecordTabShortcuts, // ★新規追加
    openShareModal, // ★新規追加
    showRolloverModal
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
         renderCheckLibrary,
         applyLibraryChanges,
         applyPreset,
         deleteCheckItem,
         addNewCheckItem } from './checkForm.js';
import * as LogDetail from './logDetail.js';

import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const refreshUI = async () => {
    try {
        if (!DOM.isInitialized) DOM.init();

        // 1. Serviceから「調理済み」のデータ一式をもらう
        const { logs, checks, allLogs, balance } = await Service.getAppDataSnapshot();

        UI._statsData.periodLogs = logs;
        UI._statsData.allLogs = allLogs;

        // 2. --- 全タブ共通の更新（ヘッダー等の共通パーツがあればここ） ---
        // ※現在は共通パーツが少ないため、各タブの判定へ進みます

        // 3. --- アクティブなタブに応じた描画の振り分け（最適化） ---
        const activeTabEl = document.querySelector('.tab-content.active');
        const activeTabId = activeTabEl ? activeTabEl.id.replace('tab-', '') : 'home';

        if (activeTabId === 'home') {
            renderBeerTank(balance);
            renderLiverRank(checks, allLogs);
            renderCheckStatus(checks, logs);
            await renderWeeklyAndHeatUp(logs, checks);
            renderChart(allLogs, checks);
        } 
        else if (activeTabId === 'record') {
            await renderRecordTabShortcuts();
        } 
        else if (activeTabId === 'cellar') {
            await updateLogListView(false, allLogs);
            if (StateManager.cellarViewMode === 'stats') {
                renderBeerStats(logs, allLogs);
            } else if (StateManager.cellarViewMode === 'archives') {
                renderArchives();
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

        // 🍺 ビール保存
        document.addEventListener('save-beer', async (e) => {
    const btn = document.getElementById('btn-save-beer');
    if (btn && btn.disabled) return;
    const { data, existingId } = e.detail;

    try {

        if (btn) {
            btn.disabled = true; // 処理開始時にロック
            btn.innerHTML = '<i class="ph-bold ph-circle-notch animate-spin"></i> Saving...';
        }
        // 1. Serviceに保存を依頼し、結果を受け取る
        const result = await Service.saveBeerLog(data, existingId);
        
        if (result.success) {
            // 2. メッセージの組み立て
            let msg = "";
            if (result.isUpdate) {
                msg = '<i class="ph-bold ph-pencil-simple"></i> 記録を更新しました';
                Feedback.tap(); // 更新時は控えめな音
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
            btn.textContent = 'Save Record';
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
            btn.innerHTML = '<i class="ph-bold ph-circle-notch animate-spin"></i> Saving...';
        }
        // 1. Serviceの実行結果を待つ
        const result = await Service.saveExerciseLog(exerciseKey, minutes, date, applyBonus, id);
        
        if (result.success) {
            // 2. メッセージの動的な組み立て
            let msg = "";
            if (result.isUpdate) {
                msg = '<i class="ph-bold ph-pencil-simple"></i> 記録を更新しました';
                Feedback.tap();
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
            btn.textContent = 'Save Record';
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
        existingLog = await db.logs.get(editingId);
    }

    // 引数に既存ログを渡す（beerForm.js側の修正とセットで機能します）
    const data = getBeerFormData(existingLog); 
    
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
        existingLog = await db.logs.get(editingId);
    }

    const data = getBeerFormData(existingLog);
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

        initTheme();
        UI.isInitialized = true;
    },

    switchTab: (tabId) => {
        const currentTab = document.querySelector('.tab-content.active');
        if (currentTab && currentTab.id === `tab-${tabId}`) return;

        DOM.withTransition(async () => {
            Feedback.uiSwitch();

            const fab = document.getElementById('btn-fab-fixed');
            const saveBtn = document.getElementById('settings-save-container');
            
            // オンボーディング状態の判定
            const onboarding = document.getElementById('onboarding-screen');
            const isOnboarding = onboarding && !onboarding.classList.contains('hidden');

            // --- FAB (プラスボタン) の表示管理 ---
            if (fab) {
                // ホーム か セラー の時、かつオンボーディング中でない場合のみ
                const isTargetTab = ['home', 'cellar'].includes(tabId);
                const shouldShowFab = isTargetTab && !isOnboarding;

                if (shouldShowFab) {
                    fab.classList.remove('scale-0', 'opacity-0', 'pointer-events-none', 'translate-y-24');
                    fab.classList.add('scale-100', 'opacity-100', 'pointer-events-auto', 'translate-y-0');
                } else {
                    // 他のタブ（record, settings）やオンボーディングでは物理的に消す
                    fab.classList.remove('scale-100', 'opacity-100', 'pointer-events-auto', 'translate-y-0');
                    fab.classList.add('scale-0', 'opacity-0', 'pointer-events-none', 'translate-y-24');
                }
            }

            // --- Save Changes ボタンの表示管理 ---
            if (saveBtn) {
                const isSettingsTab = (tabId === 'settings');
                const shouldShowSave = isSettingsTab && !isOnboarding;

                if (shouldShowSave) {
                    saveBtn.classList.remove('opacity-0', 'translate-y-10', 'pointer-events-none');
                    saveBtn.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
                } else {
                    saveBtn.classList.add('opacity-0', 'translate-y-10', 'pointer-events-none');
                    saveBtn.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
                }
            }

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
   
                // ★ 修正: わずかな遅延を入れ、かつ window だけでなく 
                // 文書全体に対してスクロールを強制する
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

            // 修正後（一本化）:
            if (tabId === 'settings') {
                renderSettings(); // 設定項目のみDOM構築が必要なため残す
            }
            if (tabId === 'cellar') {
            // 表示モードのセットのみ行い、描画は refreshUI に任せる
            StateManager.setCellarViewMode(StateManager.cellarViewMode || 'logs');
            UI.switchCellarView(StateManager.cellarViewMode);
            }
            
            // どのタブへの切り替えでも、最終的に1回だけ更新をかける
            await refreshUI();
        });
    },

    switchCellarView: (mode) => {
        if (typeof Feedback !== 'undefined') {
        Feedback.uiSwitch();
        }
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
            refreshUI();
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

    openLogDetail: async (id) => {
        Feedback.tap();
        const log = await db.logs.get(parseInt(id));
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
                        type: log.type ?? 'sweet',   // ★修正
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
          
    handleRolloverAction: handleRolloverAction, 
    handleSaveSettings: handleSaveSettings,
    share: Share.generateAndShare,
    get selectedDate() { return StateManager.selectedDate; },
    toggleModal: (id, show) => toggleModal(id, show),
    deleteSelectedLogs: deleteSelectedLogs,
    showRolloverModal: showRolloverModal,
    showUpdateNotification: showUpdateNotification,
    renderCheckLibrary: renderCheckLibrary,
    applyLibraryChanges: applyLibraryChanges,
    applyPreset: applyPreset,
    deleteCheckItem: deleteCheckItem,
    addNewCheckItem: addNewCheckItem,

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
