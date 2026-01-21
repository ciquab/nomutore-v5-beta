import { BeerModal } from './beerModal.js';
import { CheckModal } from './checkModal.js';
import { ExerciseModal } from './exerciseModal.js';
import { ActionMenu } from './actionMenu.js';
import { toggleModal, showMessage } from '../dom.js';
import { Timer } from '../timer.js';

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
export const applyLibraryChanges = CheckModal.saveLibraryChanges;

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

export const openTimer = (reset = false) => {
    if (reset) Timer.reset();
    toggleModal('timer-modal', true);
    Timer.init();
};

export const closeTimer = () => {
    toggleModal('timer-modal', false);
};

// 互換性維持
export const updateInputSuggestions = () => {}; 
export const renderQuickButtons = () => {}; 
export const openLogDetail = () => {}; 
export const updateModeSelector = () => {}; 