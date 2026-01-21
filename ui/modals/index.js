import { BeerModal } from './BeerModal.js';
import { CheckModal } from './CheckModal.js';
import { ExerciseModal } from './ExerciseModal.js';
import { ActionMenu } from './ActionMenu.js';
import { toggleModal, showMessage } from '../dom.js';
import { Timer } from '../timer.js';

// --- 各モーダル機能のエイリアスエクスポート ---

// Beer Modal
export const openBeerModal = BeerModal.open;
export const resetBeerForm = BeerModal.resetForm;
export const getBeerFormData = BeerModal.getFormData;
export const switchBeerInputTab = BeerModal.switchTab;
export const adjustBeerCount = BeerModal.adjustCount;
export const searchUntappd = BeerModal.searchUntappd;
export const updateBeerSelectOptions = BeerModal.updateSelectOptions;

// Check Modal & Library
export const openCheckModal = CheckModal.open;
export const openCheckLibrary = CheckModal.openLibrary;
export const applyPreset = CheckModal.applyPreset;
export const applyLibraryChanges = CheckModal.saveLibraryChanges;

// Exercise Modal
export const openManualInput = ExerciseModal.open;

// Action Menu
export const openActionMenu = ActionMenu.open;
export const handleActionSelect = ActionMenu.handleSelect;


// --- 汎用・その他モーダル制御 ---

export const closeModal = (id) => toggleModal(id, false);

// ヘルプモーダル (初回セットアップ誘導ロジックを含む)
export const openHelp = (isFirstTime = false) => {
    toggleModal('help-modal', true);
    
    const footerBtn = document.querySelector('#help-modal button.w-full');
    if (footerBtn) {
        if (isFirstTime) {
            footerBtn.textContent = "Start Setup";
            footerBtn.onclick = () => {
                toggleModal('help-modal', false);
                // Settingsタブへ移動 (window.UI経由)
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
export const openTimer = (reset = false) => {
    if (reset) Timer.reset();
    toggleModal('timer-modal', true);
    Timer.init();
};

export const closeTimer = () => {
    // 動作中なら確認が必要だが、UI操作としては閉じるだけ
    toggleModal('timer-modal', false);
};


// --- 互換性維持のためのプレースホルダー ---
// 既存のコードがこれらの関数をインポートしている可能性があるため残す
export const updateInputSuggestions = () => {}; 
export const renderQuickButtons = () => {}; 
export const openLogDetail = () => {}; 
export const updateModeSelector = () => {};