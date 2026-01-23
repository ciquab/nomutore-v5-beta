import { APP, EXERCISE, SIZE_DATA, CALORIES } from './constants.js';
import { Store, ExternalApp, db } from './store.js'; 
import { Calc } from './logic.js';
import { UI, StateManager, updateBeerSelectOptions, refreshUI, toggleModal } from './ui/index.js';
import { Service } from './service.js';
import { Timer } from './ui/timer.js';
import { DataManager } from './dataManager.js';
import { initErrorHandler } from './errorHandler.js';
import { handleSaveSettings, setupModalOptions } from './ui/modal.js'; 
import { CloudManager } from './cloudManager.js';
import { Onboarding } from './ui/onboarding.js';
import { Navigation } from './ui/navigation.js';
import { Events } from './ui/events.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// HTMLからonclickで呼ぶためにwindowオブジェクトに登録
window.UI = UI;
window.DataManager = DataManager;

/* ==========================================================================
   Initialization & Global State
   ========================================================================== */

initErrorHandler();

let editingLogId = null;
let editingCheckId = null;

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
    try {
        console.log('App Initializing...');

        // ★追加: Google Drive API 初期化 (非同期で裏で走らせておく)
        CloudManager.init().then(() => {
            console.log('CloudManager ready');
        }).catch(err => {
            console.warn('CloudManager init failed (Offline?):', err);
        });
        
        // 1. Init DOM Elements
        UI.init(); 
        setupModalOptions();
        
        // 2. Setup Event Listeners
        setupLifecycleListeners();

        // 3. Migration & Initial Data Logic
        let isFirstRun = false;
        // データ移行処理（あれば実行）
        if (Store.migrateV3ToV4) {
            isFirstRun = await Store.migrateV3ToV4();
        }

        // 4. Load & Verify Data
        updateBeerSelectOptions(); 
        UI.applyTheme(localStorage.getItem(APP.STORAGE_KEYS.THEME) || 'system');

        // 当日のチェックレコードを確保（なければ作成）
        await Service.ensureTodayCheckRecord();

        // 期間リセットの確認
        const rolledOver = await Service.checkPeriodRollover();
        if (rolledOver) {
            toggleModal('rollover-modal', true);
        }

        // 5. Initial Render
        await refreshUI();

        // 6. Restore Timer State
        if (localStorage.getItem(APP.STORAGE_KEYS.TIMER_START)) {
            UI.openTimer();
        }

        // 7. Onboarding & LP Check (v5 Updated)
        if (window.Onboarding && window.Onboarding.checkLandingPage) {
            // UI描画の安定を待ってから、LPの表示チェックを開始
            setTimeout(() => {
                window.Onboarding.checkLandingPage();
            }, 800);
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
    // 役割を分担して初期化
    Navigation.init(); 
    Events.init();     
    
    // アプリ本体の起動
    initApp();
});