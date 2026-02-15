// @ts-check
import { APP } from './constants.js';
import { Store } from './store.js';
import { UI, updateBeerSelectOptions, generateSettingsOptions, refreshUI, toggleModal } from './ui/index.js';
import { showAppShell } from './ui/dom.js';
import { Service } from './service.js';
import { Timer } from './ui/timer.js';
import { DataManager } from './dataManager.js';
import { initErrorHandler } from './errorHandler.js';
import { CloudManager } from './cloudManager.js';
import { Onboarding } from './ui/onboarding.js';
import { actionRouter, initActionRouter } from './ui/actionRouter.js';
import { NotificationManager } from './notifications.js';

import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// ========================================
// ActionRouter への登録（新規追加）
// ========================================

/**
 * 【重要】DOMContentLoaded の中で actionRouter.init() を呼ぶ前に
 * すべてのアクションを登録しておく必要があります
 */
const registerActions = () => {
    actionRouter.registerBulk({
        // ========== UI系 ==========
        'ui:switchTab': (tabName) => UI.switchTab(tabName),
        'ui:switchCellarView': (viewName) => UI.switchCellarViewHTML(viewName),
        'ui:applyTheme': () => {
            UI.toggleTheme();
        },
        'ui:openShareModal': () => UI.openShareModal(),
        'ui:openDayDetail': (data) => {
            if (UI && UI.openDayDetail) {
                UI.openDayDetail(data.date);
            }
        },  
        
        // ========== Chart系 (追加) ==========
        'chart:period': (args) => UI.handleChartPeriod(args.range),

        // ========== Modal系 ==========
        'modal:open': (modalId) => toggleModal(modalId, true),
        'modal:close': (modalId) => toggleModal(modalId, false),
        'modal:toggle': (modalId) => {
            UI.toggleModal(modalId);
        },
        'modal:openBeer': () => UI.openBeerModal(),
        'modal:openExercise': () => UI.openManualInput(),
        'modal:openCheck': () => UI.openCheckModal(),
        'modal:openSettings': () => toggleModal('settings-modal', true),
        'modal:openTimer': () => UI.openTimer(true),
        'modal:closeTimer': () => UI.closeTimer(),
        'modal:openHelp': (section) => UI.openHelp(section),
        'modal:openActionMenu': () => UI.openActionMenu(),
        'modal:openCheckLibrary': () =>  UI.openCheckLibrary(),
        
        // ========== Data系 ==========
        'data:exportCSV': (type) => DataManager.exportCSV(type),
        'data:exportJSON': () => DataManager.exportJSON(),
        'data:importJSON': () => DataManager.importJSON(),
        'data:backupToCloud': () => DataManager.backupToCloud(),
        'data:restoreFromCloud': () => DataManager.restoreFromCloud(),
        'data:triggerImportFile': () => UI.triggerFileInput('import-file'),
        
        // ========== Log系 ==========
        'log:deleteSelected': () => {
            import('./ui/logList.js').then(m => m.deleteSelectedLogs());
        },
        'log:toggleEditMode': () => UI.toggleEditMode(),
        'log:toggleSelectAll': () => UI.toggleSelectAll(),
        'log:openDetail': (data) => {
            if (UI && UI.openLogDetail) {
                UI.openLogDetail(data.id);
            }
        },
        'log:repeat': (payload, event) => {
            UI.handleRepeat(payload);
    
            // イベント元の要素から data-on-success 属性を取得
            const target = event.target.closest('[data-action="log:repeat"]');
            if (target) {
                const onSuccess = target.dataset.onSuccess;
                const param = target.dataset.onSuccessParam;
        
                if (onSuccess === 'modal:close' && param) {
                    setTimeout(() => toggleModal(param, false), 100);
                }
            }
        },
        
        // ========== Check系 ==========
        'check:applyPreset': (presetName) => {
            if (typeof UI.applyPreset === 'function') {
                UI.applyPreset(presetName);
            }
        },
        'check:applyLibraryChanges': () => {
            if (typeof UI.applyLibraryChanges === 'function') {
                UI.applyLibraryChanges();
            }
        },
        'check:addNewItem': () => {
            if (typeof UI.addNewCheckItem === 'function') {
                UI.addNewCheckItem();
            }
        },
        
        'check:renderLibrary': () => {
            if (typeof UI.renderCheckLibrary === 'function') {
                UI.renderCheckLibrary();
            }
        },
        'check:deleteItem': (index) => {
            if (typeof UI.deleteCheckItem === 'function') {
                UI.deleteCheckItem(index);
            }
        },
        'check:changeDate': (args, event) => UI.handleCheckDateChange(event),
        'check:toggleDry': (args, event) => UI.handleDryDayToggle(event),
        'check:toggleLibraryItem': (args) => UI.handleLibraryItemToggle(args.id),
        
        // ========== Onboarding系 ==========
        'onboarding:close': () => Onboarding.closeLandingPage(),
        'onboarding:nextStep': () => Onboarding.nextStep(),
        'onboarding:prevStep': () => Onboarding.prevStep(),
        'onboarding:finish': () => Onboarding.finishWizard(),
        'onboarding:goToWizard': () => Onboarding.goToWizard(),
        'onboarding:start-new': () => Onboarding.startNew(),
        // ▼ 修正：Serviceの呼び出しをActionRouter側で行い、結果をOnboardingに伝える
        'onboarding:setPeriod': async (args) => {
            try {
                // 1. データ層（Service）で期間設定を保存
                await Service.updatePeriodSettings(args.mode);
                
                // 2. 成功したらUI層（Onboarding）を次のステップへ進める
                Onboarding.nextStep();
            } catch (e) {
                console.error('Period setup failed:', e);
                if (UI && UI.showMessage) UI.showMessage('設定の保存に失敗しました', 'error');
            }
        },
        'onboarding:handleCloudRestore': () => Onboarding.handleCloudRestore(),
        'onboarding:triggerJson': () => UI.triggerFileInput('wizard-import-file'),
        
        // ========== Timer系 ==========
        'timer:toggle': () => Timer.toggle(),
        'timer:finish': () => Timer.finish(),
        'timer:reset': () => Timer.reset(),
        
        // ========== Settings系 ==========
        'settings:save': () => UI.handleSaveSettings(),
        
        // ========== Day Add Selector系 ==========
        'dayAdd:openBeer': () => {
            toggleModal('day-add-selector', false);
            setTimeout(() => UI.openBeerModal(null, UI.selectedDate), 200);
        },
        'dayAdd:openExercise': () => {
            toggleModal('day-add-selector', false);
            setTimeout(() => UI.openManualInput(UI.selectedDate), 200);
        },
        'dayAdd:openCheck': () => {
            toggleModal('day-add-selector', false);
            setTimeout(() => UI.openCheckModal(UI.selectedDate), 200);
        },

        // ========== Beer系 ==========

        'beer:openFirst': () => {
            UI.openBeerModal();
            toggleModal('action-menu-modal', false);
        },

        // ========== Help系 ==========
        'help:goToSettings': () => {
            UI.switchTab('settings');
            toggleModal('help-modal', false);
        },
        
        // ========== System系 ==========
        'system:reload': () => location.reload(),

        // ========== Rollover系 ==========
        'rollover:weekly':     () => UI.handleRollover('weekly'),
        'rollover:new_custom': () => UI.handleRollover('new_custom'),
        'rollover:extend':     () => UI.handleRollover('extend'),
    });

    document.addEventListener('request-share-image', (e) => { UI.share(e.detail.type, e.detail.data);});
    
    console.log('[main.js] ✅ All actions registered to ActionRouter');
    console.log(`[main.js] 📊 Total registered: ${actionRouter.handlers.size} actions`);
};

/* ==========================================================================
   Initialization & Global State
   ========================================================================== */

initErrorHandler();

// ▼▼▼ Service Worker 登録 & 更新監視ロジック ▼▼▼
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {

        // ----------------------------------------------------
        // 1. 新規追加: 更新直後のリロードかどうかをチェック
        // ----------------------------------------------------
        if (localStorage.getItem('nomutore_just_updated')) {
            localStorage.removeItem('nomutore_just_updated'); // フラグ消去
            
            // UI描画の準備を待ってから表示 (1秒後)
            setTimeout(() => {
                // UIオブジェクトが利用可能か確認（念のため）
                if (UI && UI.showMessage) {
                    UI.showMessage('新しいバージョンに更新しました', 'success');
                }
            }, 1000);
        }

        // ----------------------------------------------------
        // 2. 既存: Service Workerの登録と更新監視
        // ----------------------------------------------------
        navigator.serviceWorker.register('./service-worker.js').then(reg => {
            console.log('[SW] Registered:', reg.scope);

            // A. 既に待機中のSWがいる場合
            if (reg.waiting) {
                UI.showUpdateNotification(reg.waiting);
                return;
            }

            // B. 更新が見つかった場合
            reg.onupdatefound = () => {
                const installingWorker = reg.installing;
                installingWorker.onstatechange = () => {
                    if (installingWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            console.log('[SW] New content is available; please refresh.');
                            UI.showUpdateNotification(installingWorker);
                        } else {
                            console.log('[SW] Content is cached for the first time!');
                        }
                    }
                };
            };
        }).catch(err => console.error('[SW] Registration failed:', err));

        // 制御が切り替わった瞬間にリロード
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    });
}

let lastActiveDate = Store.getLastActiveDate() || dayjs().format('YYYY-MM-DD');

/* ==========================================================================
   Lifecycle Management
   ========================================================================== */

const setupLifecycleListeners = () => {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            const today = dayjs().format('YYYY-MM-DD');
            if (lastActiveDate !== today) {
                console.log('New day detected on resume. Refreshing...');
                lastActiveDate = today;
                Store.setLastActiveDate(today);
                await handleDayChangeResume();
            } else {
                if (Timer.checkResume) {
                     Timer.checkResume();
                }
            }
        }
    });
};

/**
 * 日付変更時の再初期化（initAppの軽量版）
 * スプラッシュ・オンボーディング・UI.init等は再実行せず、
 * データ更新に必要な処理のみ行う
 */
const handleDayChangeResume = async () => {
    try {
        await Service.ensureTodayCheckRecord();
        const rolledOver = await Service.checkPeriodRollover();
        if (rolledOver) {
            UI.showRolloverModal();
        } else {
            await refreshUI();
        }
        if (Timer && Timer.init) Timer.init();
    } catch (e) {
        console.error('Day-change resume error:', e);
    }
};

/* ==========================================================================
   App Initialization
   ========================================================================== */

// ★修正: 初期化ロジックを分離し、エラーハンドリングを強化
const initApp = async () => {
    // 二重起動防止ガード（念のため）
    if (window._isAppInitialized) {
        console.warn('App already initialized. Skipping.');
        return;
    }
    window._isAppInitialized = true;

    try {
        console.log('App Initializing...');

        // 1. スマート・スプラッシュ判定 (Smart Splash Logic)
        const isOnboarded = localStorage.getItem(APP.STORAGE_KEYS.ONBOARDED);
        const lastLaunchKey = 'nomutore_last_launch_ts';
        const lastLaunch = parseInt(localStorage.getItem(lastLaunchKey) || '0');
        const now = Date.now();
        const THRESHOLD = 6 * 60 * 60 * 1000; // 6時間 (テスト時は 10000=10秒 などに短縮して確認可)

        if (!isOnboarded) {
            // A. 初回ユーザー -> 既存の判定ロジックにお任せ (Wizardへ)
            if (Onboarding && Onboarding.checkLandingPage) {
                Onboarding.checkLandingPage();
            }
        } else {
            // B. 既存ユーザー -> 時間経過判定
            if (now - lastLaunch > THRESHOLD) {
                // 久しぶり -> スプラッシュ再生 (playSplashがあれば実行)
                console.log('✨ Showing Smart Splash (Time elapsed)');
                if (Onboarding && Onboarding.playSplash) {
                    Onboarding.playSplash();
                } else {
                    // フォールバック（メソッド未実装時）
                    if (Onboarding && Onboarding.checkLandingPage) {
                        Onboarding.checkLandingPage();
                    }
                }
            } else {
                // 直近の利用 -> 即ホーム画面へ (LPを即座に消す)
                console.log('🚀 Skipping Splash (Quick Resume)');
                if (Onboarding && Onboarding.checkLandingPage) {
                    Onboarding.checkLandingPage();
                }
            }
            // 最終起動時刻を更新
            localStorage.setItem(lastLaunchKey, now.toString());
        }

        // LPを表示する必要がない（＝オンボーディング済み）場合だけ表示をONにする
        if (isOnboarded) {
            showAppShell();
        }

        // 2. 重い初期化（Google Drive 等）は、UI 表示と並行または後で行う
        CloudManager.init().then(() => {
            console.log('CloudManager ready');
        }).catch(err => {
            console.warn('CloudManager init failed:', err);
        });

        UI.init();

        // 3. Migration & Initial Data Logic
        if (Store.migrateV3ToV4) {
            await Store.migrateV3ToV4();
        }

        // 4. Load & Verify Data
        updateBeerSelectOptions(); 
        generateSettingsOptions();
        UI.applyTheme(Store.getTheme());

        // 当日のチェックレコードを確保（なければ作成）
        await Service.ensureTodayCheckRecord();

        // 期間リセットの確認
        const rolledOver = await Service.checkPeriodRollover();
        if (rolledOver) {
            // モーダルを表示するだけ（refreshUI と switchTab はモーダル操作後に実行される）
            UI.showRolloverModal();
        }

        // 初回描画（rollover時もモーダル背景に画面を出すため常に実行）
        await refreshUI();
        if (Timer && Timer.init) {
            Timer.init();
        }
        UI.switchTab('home', { silent: true });

        UI.enableInteractions();
        console.log('🚀 UI initialized and interactions enabled');

        // 7. 通知スケジュールの初期化
        NotificationManager.init();

        // 8. サーバーサイド Push 購読の再同期（既存購読者のみ）
        if (localStorage.getItem('nomutore_push_subscribed') === 'true') {
            NotificationManager.syncPushSubscription().catch(e =>
                console.warn('[Push] Re-sync failed:', e)
            );
        }
       
    } catch (e) {
        // 致命的なエラーが発生した場合、エラー画面を表示する
        console.error('Critical Initialization Error:', e);
        import('./errorHandler.js').then(m => m.showErrorOverlay(
            `初期化に失敗しました。\n${e.message}`, 
            'main.js (initApp)', 
            0
        ));
    }
};

/* ==========================================================================
   Event Bindings (Global)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // 1. アクション登録（最優先）
    registerActions();
    
    // 2. ActionRouter初期化
    initActionRouter();
    document.addEventListener('action-error', (e) => {
        const { action, error } = e.detail;
        console.error(`[Action Error] ${action}:`, error);
        if (UI && UI.showMessage) {
            UI.showMessage('操作中にエラーが発生しました', 'error');
        }
    });

    // 3. ライフサイクル管理
    setupLifecycleListeners();

    initApp();
});
















