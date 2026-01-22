import { APP, EXERCISE, SIZE_DATA, CALORIES } from './constants.js';
import { Store, ExternalApp, db } from './store.js'; 
import { Calc } from './logic.js';
import { UI, StateManager, updateBeerSelectOptions, refreshUI, toggleModal } from './ui/index.js';
import { Service } from './service.js';
import { Timer } from './ui/timer.js';
import { DataManager } from './dataManager.js';
import { initErrorHandler } from './errorHandler.js';
import { handleSaveSettings } from './ui/modal.js'; 
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
        
        // 1. Init DOM Elements
        UI.init(); 
        
        // 2. Setup Event Listeners
        setupLifecycleListeners();
        setupGlobalListeners();

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

        // 7. Onboarding Check
        const hasWeight = localStorage.getItem(APP.STORAGE_KEYS.WEIGHT);
        if (isFirstRun || !hasWeight) {
            // 初回起動時はヘルプ（ガイド）を開く
            setTimeout(() => UI.openHelp(true), 500);
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
   Global Event Listeners (Swipe, etc)
   ========================================================================== */

const setupGlobalListeners = () => {
    // Swipe
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, {passive: true});

    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, {passive: true});

    // Coach Mark Logic (初回のみ)
    const KEY = 'nomutore_coach_shown_v4';
    if (!localStorage.getItem(KEY)) {
        showSwipeCoachMark();
    }
};

const showSwipeCoachMark = () => {
    const KEY = 'nomutore_seen_swipe_hint';
    if (localStorage.getItem(KEY)) return;
    const el = document.getElementById('swipe-coach-mark');
    if (!el) return;
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.remove('opacity-0'));
    setTimeout(() => {
        el.classList.add('opacity-0');
        setTimeout(() => el.classList.add('hidden'), 1000);
        localStorage.setItem(KEY, 'true');
    }, 3000);
};


/* ==========================================================================
   Event Bindings (Global)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    document.addEventListener('save-beer', async (e) => {
        const data = e.detail;
        
        // ★修正: 編集IDを取得
        const idField = document.getElementById('editing-log-id');
        const existingId = idField && idField.value ? parseInt(idField.value) : null;

        // ★修正: 新規・更新ともに Service.saveBeerLog に任せます
        // Service内で IDがあれば update, なければ add を適切に処理してくれます
        await Service.saveBeerLog(data, existingId);

        // Untappd連携
        if (data.useUntappd) {
            const query = encodeURIComponent(`${data.brewery || ''} ${data.brand || ''}`.trim());
            if(query) {
                setTimeout(() => {
                    window.open(`https://untappd.com/search?q=${query}`, '_blank');
                }, 100);
            }
        }
        
        // リフレッシュ
        await refreshUI();
    });

    document.addEventListener('save-check', async (e) => {
        await Service.saveDailyCheck(e.detail);
    });

    // ★追加: 運動記録の共通イベントリスナー
    document.addEventListener('save-exercise', async (e) => {
        // detail: { exerciseKey, minutes, date, applyBonus, id? }
        const { exerciseKey, minutes, date, applyBonus, id } = e.detail;
        
        try {
            await Service.saveExerciseLog(exerciseKey, minutes, date, applyBonus, id);
            
            // モーダルが開いていれば閉じる（手動入力の場合）
            toggleModal('exercise-modal', false);
            
            // もし編集中のIDフィールドがあればリセット
            const editIdField = document.getElementById('editing-exercise-id');
            if(editIdField) editIdField.value = '';
            
        } catch(err) {
            console.error(err);
            UI.showMessage('運動の記録に失敗しました', 'error');
        }
    });

    document.addEventListener('bulk-delete', async () => {
        const checkboxes = document.querySelectorAll('.log-checkbox:checked');
        const ids = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));
        if (ids.length > 0) {
            await Service.bulkDeleteLogs(ids);
        } else {
            UI.toggleEditMode();
        }
    });
    
    document.addEventListener('confirm-rollover', async () => {
        toggleModal('rollover-modal', false);
        await refreshUI();
        UI.showConfetti();
    });
    
    document.addEventListener('refresh-ui', async () => {
         await refreshUI();
    });

    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
        btnSaveSettings.onclick = handleSaveSettings;
    }

    const btnTimerStart = document.getElementById('btn-timer-start');
    if(btnTimerStart) btnTimerStart.addEventListener('click', () => Timer.start());
    
    const btnTimerStop = document.getElementById('btn-timer-stop');
    if(btnTimerStop) btnTimerStop.addEventListener('click', () => Timer.stop());
    
    const btnTimerReset = document.getElementById('btn-timer-reset');
    if(btnTimerReset) btnTimerReset.addEventListener('click', () => Timer.reset());

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


/* ==========================================================================
   Swipe Navigation (v3 Spec Restored)
   ========================================================================== */
let touchStartX = 0;
let touchStartY = 0; // ★追加: Y座標の変数を定義
let touchEndX = 0;
let touchEndY = 0;   // ★追加: Y座標の変数を定義

const handleSwipe = () => {
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY; // touchStartでYも取得しておく必要あり
    const swipeThreshold = 100; // スワイプと判定する距離(px)
    const diff = touchStartX - touchEndX;
    const tabs = ['home', 'record', 'cellar', 'settings'];
    const currentTab = document.querySelector('.nav-pill-active')?.id.replace('nav-tab-', '');
    const currentIndex = tabs.indexOf(currentTab);

    // 縦スクロールの意図が強い場合は無視
    if (Math.abs(diffY) > Math.abs(diffX)) return;

    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0 && currentIndex < tabs.length - 1) {
            // 左スワイプ -> 次のタブへ
            UI.switchTab(tabs[currentIndex + 1]);
        } else if (diff < 0 && currentIndex > 0) {
            // 右スワイプ -> 前のタブへ
            UI.switchTab(tabs[currentIndex - 1]);
        }
    }

};
