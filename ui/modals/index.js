import { BeerModal } from './BeerModal.js';
import { CheckModal } from './CheckModal.js';
import { ExerciseModal } from './ExerciseModal.js';
import { ActionMenu } from './ActionMenu.js';
import { toggleModal, showMessage } from '../dom.js';
import { Timer } from '../timer.js';
// ★追加: 自動スタート判定のために APP 定数をインポート
import { APP } from '../../constants.js';

// --- モーダル機能エクスポート ---

// Beer
export const openBeerModal = BeerModal.open;
export const resetBeerForm = BeerModal.resetForm;
export const getBeerFormData = BeerModal.getFormData;
export const switchBeerInputTab = BeerModal.switchTab;
export const adjustBeerCount = BeerModal.adjustCount;
export const searchUntappd = BeerModal.searchUntappd;
export const updateBeerSelectOptions = BeerModal.updateSelectOptions;

// Check
export const openCheckModal = CheckModal.open;
export const openCheckLibrary = CheckModal.openLibrary;
export const applyPreset = CheckModal.applyPreset;
export const applyLibraryChanges = CheckModal.applyLibraryChanges;

// Exercise
export const openManualInput = ExerciseModal.open;

// Action
export const openActionMenu = ActionMenu.open;
export const handleActionSelect = ActionMenu.handleSelect;


// --- その他共通 ---

export const closeModal = (id) => toggleModal(id, false);

export const openHelp = (isFirstTime = false) => {
    toggleModal('help-modal', true);
    
    const footerBtn = document.querySelector('#help-modal button.w-full');
    if (footerBtn) {
        if (isFirstTime) {
            footerBtn.textContent = "Start Setup";
            footerBtn.onclick = () => {
                toggleModal('help-modal', false);
                if (window.UI && window.UI.switchTab) {
                    window.UI.switchTab('settings');
                    showMessage('まずはプロフィールを設定しましょう！', 'info');
                }
            };
        } else {
            footerBtn.textContent = "OK, Let's Drink!";
            footerBtn.onclick = () => toggleModal('help-modal', false);
        }
    }
};

// Timer関連のラッパー
// ★修正: autoStartロジックを完全復活
export const openTimer = (autoStart = false) => {
    Timer.init();
    toggleModal('timer-modal', true);
    
    // 既に実行中でなければ自動スタート
    const isRunning = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
    if (autoStart && !isRunning) {
        setTimeout(() => {
            const toggleBtn = document.getElementById('btn-timer-toggle');
            if (toggleBtn) toggleBtn.click(); 
        }, 300); // アニメーション待ち
    }
};

export const closeTimer = () => {
    const acc = localStorage.getItem(APP.STORAGE_KEYS.TIMER_ACCUMULATED);
    const start = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
    
    // 計測中または一時停止中でデータがある場合の確認
    if (start || (acc && parseInt(acc) > 0)) {
        if (!confirm('タイマーをバックグラウンドで実行したまま閉じますか？\n(計測は止まりません)')) return;
    }
    toggleModal('timer-modal', false);
};

// 互換性維持
export const updateInputSuggestions = () => {}; 
export const renderQuickButtons = () => {}; 
export const openLogDetail = () => {}; 

export const updateModeSelector = () => {}; 
