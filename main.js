import { APP, EXERCISE, SIZE_DATA, CALORIES } from './constants.js';
import { Store, ExternalApp, db } from './store.js'; 
import { Calc } from './logic.js';
import { UI, StateManager, updateBeerSelectOptions, refreshUI, toggleModal, initHandleRepeatDelegation } from './ui/index.js';
import { showConfetti, showMessage } from './ui/dom.js';
import { Service } from './service.js';
import { Timer } from './ui/timer.js';
import { DataManager } from './dataManager.js';
import { initErrorHandler } from './errorHandler.js';
import { handleSaveSettings } from './ui/modal.js'; 
import { CloudManager } from './cloudManager.js';
import { Onboarding } from './ui/onboarding.js';
import { actionRouter, initActionRouter } from './ui/actionRouter.js';

import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/**
 * FileInput の change イベント登録
 * （data-action では扱えないため個別に登録）
 */
export const setupFileInputHandlers = () => {
    const importFileInput = document.getElementById('import-file');
    if (importFileInput) {
        importFileInput.addEventListener('change', function(e) {
            DataManager.importJSON(this);
        });
    }
};

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
            const isDark = document.documentElement.classList.contains('dark');
            UI.applyTheme(isDark ? 'light' : 'dark');
        },
        'ui:openShareModal': () => UI.openShareModal(),
        'ui:openDayDetail': (data) => {
            if (UI && UI.openDayDetail) {
                UI.openDayDetail(data.date);
            }
        },       
        // ========== Modal系 ==========
        'modal:open': (modalId) => toggleModal(modalId, true),
        'modal:close': (modalId) => toggleModal(modalId, false),
        'modal:toggle': (modalId) => {
            const modal = document.getElementById(modalId);
            const isVisible = modal && !modal.classList.contains('hidden');
            toggleModal(modalId, !isVisible);
        },
        'modal:openBeer': () => UI.openBeerModal(),
        'modal:openExercise': () => UI.openManualInput(),
        'modal:openCheck': () => UI.openCheckModal(),
        'modal:openSettings': () => toggleModal('settings-modal', true),
        'modal:openTimer': () => UI.openTimer(),
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
        'data:triggerImportFile': () => {
            const fileInput = document.getElementById('import-file');
            if (fileInput) fileInput.click();
        },
        
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
        
        // ========== Onboarding系 ==========
        'onboarding:close': () => Onboarding.closeLandingPage(),
        'onboarding:nextStep': () => Onboarding.nextStep(),
        'onboarding:prevStep': () => Onboarding.prevStep(),
        'onboarding:finish': () => Onboarding.finishWizard(),
        'onboarding:goToWizard': () => Onboarding.goToWizard(),
        'onboarding:start-new': () => Onboarding.startNew(),
        'onboarding:setPeriod': (args) => {
            // data-mode="weekly" などの値が args.mode に入る
            Onboarding.setPeriodMode(args.mode);
        },
        'onboarding:handleCloudRestore': () => Onboarding.handleCloudRestore(),
        'onboarding:triggerJson': () => document.getElementById('wizard-import-file').click(),
        
        // ========== Timer系 ==========
        'timer:toggle': () => Timer.toggle(),
        'timer:finish': () => Timer.finish(),
        'timer:reset': () => Timer.reset(),
        
        // ========== Settings系 ==========
        'settings:save': () => handleSaveSettings(),
        
        // ========== Day Add Selector系 ==========
        'dayAdd:openBeer': () => {
            toggleModal('day-add-selector', false);
            setTimeout(() => UI.openBeerModal(UI.selectedDate), 200);
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

        // ========== Rollover系 (追加) ==========
        'rollover:weekly': () => UI.handleRolloverAction('weekly'),
        
        'rollover:new_custom': () => UI.handleRolloverAction('new_custom'),
        
        'rollover:extend': () => UI.handleRolloverAction('extend'),
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

const LAST_ACTIVE_KEY = 'nomutore_last_active_date';
let lastActiveDate = localStorage.getItem(LAST_ACTIVE_KEY) || dayjs().format('YYYY-MM-DD');

/* ==========================================================================
   Lifecycle Management
   ========================================================================== */

let isResuming = false;

const setupLifecycleListeners = () => {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            const today = dayjs().format('YYYY-MM-DD');
            if (lastActiveDate !== today) {
                console.log('New day detected on resume. Refreshing...');
                lastActiveDate = today;
                localStorage.setItem(LAST_ACTIVE_KEY, today);
                isResuming = true;
                await initApp(); 
                isResuming = false;
            } else {
                if (Timer.checkResume) { 
                     Timer.checkResume(); 
                }
            }
        }
    });
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
        const isOnboarded = localStorage.getItem('APP.STORAGE_KEYS.ONBOARDED');
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

        // 2. 重い初期化（Google Drive 等）は、UI 表示と並行または後で行う
        CloudManager.init().then(() => {
            console.log('CloudManager ready');
        }).catch(err => {
            console.warn('CloudManager init failed:', err);
        });

        UI.init();
        

        // 3. Migration & Initial Data Logic
        let isFirstRun = false;
        // データ移行処理（あれば実行）
        if (Store.migrateV3ToV4) {
            isFirstRun = await Store.migrateV3ToV4();
        }

        // 4. Load & Verify Data
        updateBeerSelectOptions(); 
        generateSettingsOptions();
        UI.applyTheme(localStorage.getItem(APP.STORAGE_KEYS.THEME) || 'system');

        // 当日のチェックレコードを確保（なければ作成）
        await Service.ensureTodayCheckRecord();

        // 期間リセットの確認
        const rolledOver = await Service.checkPeriodRollover();
        if (rolledOver) {
        // ★修正: 単にtoggleModalするのではなく、UIの関数を呼ぶ
        UI.showRolloverModal();
        }

        // 5. Initial Render
        await refreshUI();


        // 7. Restore Timer State
        // ★修正: Timer.init() を呼ぶだけでOKです。
        // （timer.js内の checkResume() が、自動的に計算復帰とモーダル表示を行います）
        if (Timer && Timer.init) {
            Timer.init();
        }

        // 画面のロックを強制解除して表示する
        document.querySelector('header')?.classList.remove('hidden');
        document.querySelector('main')?.classList.remove('hidden');
        // ホームタブを確実にアクティブにする
        UI.switchTab('home');

        document.body.style.pointerEvents = 'auto';
        console.log('🚀 UI initialized and interactions enabled');

        setTimeout(() => {
            document.body.classList.remove('preload');
        }, 100);
       
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
   Global Event Listeners (Swipe, etc)
   ========================================================================== */

let touchStartX = null;
let touchStartY = null;
let touchEndX = 0;
let touchEndY = 0;

const setupGlobalListeners = () => {
    // --- 1. スワイプ操作 (既存) ---
    document.addEventListener('touchstart', (e) => {
        if (e.target.closest('.overflow-x-auto')) {
            touchStartX = null; touchStartY = null; return;
        }
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (touchStartX === null || touchStartY === null) return;
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: false });

    // --- 2. FABのスクロール制御 (新規追加) ---
    let lastScrollTop = 0;
    const fab = document.getElementById('btn-fab-fixed');
    
    if (fab) {
        window.addEventListener('scroll', () => {
            // タブ切り替えによって非表示に設定されている（scale-0）時は処理しない
            if (fab.classList.contains('scale-0')) return;

            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const threshold = 100; // 100px以上スクロールしたら反応させる

            if (scrollTop > lastScrollTop && scrollTop > threshold) {
                // 下にスクロール: FABを隠す (画面外へ押し出す)
                fab.classList.add('translate-y-24', 'opacity-0');
                fab.classList.remove('translate-y-0', 'opacity-100');
            } else {
                // 上にスクロール: FABを出す
                fab.classList.remove('translate-y-24', 'opacity-0');
                fab.classList.add('translate-y-0', 'opacity-100');
            }
            lastScrollTop = scrollTop;
        }, { passive: true }); // スクロール性能を落とさないために passive 指定
    }
};
// スワイプ判定ロジック（強化版）
const handleSwipe = () => {
    if (touchStartX === null) return;

    // --- 追加: モーダル表示中はスワイプを無効化する ---
    if (document.querySelector('.modal.flex')) return; 

    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;
    const swipeThreshold = 80; 
    
    // 縦の移動量が大きい（＝スクロールしようとしている）場合は無視
    // Math.abs(diffX) * 0.5 のように比率を設けると斜めスワイプの誤爆を防げます
    if (Math.abs(diffY) > Math.abs(diffX)) return;

    const tabs = ['home', 'record', 'cellar', 'settings'];
    const activeTab = document.querySelector('.nav-pill-active');
    if (!activeTab) return;
    
    const currentTab = activeTab.id.replace('nav-tab-', '');
    const currentIndex = tabs.indexOf(currentTab);

    if (Math.abs(diffX) > swipeThreshold) {
        let targetTabIndex = -1;
        
        if (diffX > 0 && currentIndex < tabs.length - 1) {
            targetTabIndex = currentIndex + 1; // 右へスワイプ（左のタブへ）
        } else if (diffX < 0 && currentIndex > 0) {
            targetTabIndex = currentIndex - 1; // 左へスワイプ（右のタブへ）
        }

        if (targetTabIndex !== -1) {
            UI.switchTab(tabs[targetTabIndex]);
            // タブを切り替えたら、画面を最上部へ戻す（UX向上）
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
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

    initHandleRepeatDelegation(); 

    // 3. ファイル入力ハンドラー
    setupFileInputHandlers();

    setupLifecycleListeners();
    setupGlobalListeners();

    initApp();
});

/* ==========================================================================
   Helper Functions
   ========================================================================== */

const generateSettingsOptions = () => {
    const createOpts = (obj, id, isKey = false) => {
        const el = document.getElementById(id);
        if(!el) return;
        el.innerHTML = '';
        Object.keys(obj).forEach(k => {
            const o = document.createElement('option');
            o.value = k;
            o.textContent = isKey 
                ? k 
                : (obj[k].label 
                    ? (obj[k].icon ? `${obj[k].icon} ${obj[k].label}` : obj[k].label)
                    : obj[k].label);
            el.appendChild(o);
        });
    };

    createOpts(EXERCISE, 'exercise-select');
    createOpts(EXERCISE, 'setting-base-exercise');
    createOpts(EXERCISE, 'setting-default-record-exercise');
    createOpts(CALORIES.STYLES, 'setting-mode-1', true);
    createOpts(CALORIES.STYLES, 'setting-mode-2', true);
    createOpts(SIZE_DATA, 'beer-size');
    
    const defRec = Store.getDefaultRecordExercise();
    const exSel = document.getElementById('exercise-select');
    if(exSel && defRec) exSel.value = defRec;
    
    const bSize = document.getElementById('beer-size');
    if(bSize) bSize.value = '350';
    
    const profile = Store.getProfile();
    const wIn = document.getElementById('weight-input');
    if(wIn) wIn.value = profile.weight;
    const hIn = document.getElementById('height-input');
    if(hIn) hIn.value = profile.height;
    const aIn = document.getElementById('age-input');
    if(aIn) aIn.value = profile.age;
    const gIn = document.getElementById('gender-input');
    if(gIn) gIn.value = profile.gender;
    
    const modes = Store.getModes();
    const m1 = document.getElementById('setting-mode-1');
    if(m1) m1.value = modes.mode1;
    const m2 = document.getElementById('setting-mode-2');
    if(m2) m2.value = modes.mode2;
    
    const baseEx = document.getElementById('setting-base-exercise');
    if(baseEx) baseEx.value = Store.getBaseExercise();
    
    const defRecSet = document.getElementById('setting-default-record-exercise');
    if(defRecSet) defRecSet.value = Store.getDefaultRecordExercise();
}


