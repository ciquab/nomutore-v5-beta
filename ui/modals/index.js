import { BeerModal } from './BeerModal.js';
import { CheckModal } from './CheckModal.js';
import { ExerciseModal } from './ExerciseModal.js';
import { ActionMenu } from './ActionMenu.js';
import { toggleModal, showMessage } from '../dom.js';
import { Timer } from '../timer.js';

// 他のファイルから呼び出しやすいようにエイリアスを設定
export const openBeerModal = BeerModal.open;
export const resetBeerForm = BeerModal.resetForm;
export const getBeerFormData = BeerModal.getFormData;
export const switchBeerInputTab = BeerModal.switchTab;
export const adjustBeerCount = BeerModal.adjustCount;
export const searchUntappd = BeerModal.searchUntappd;
export const updateBeerSelectOptions = BeerModal.updateSelectOptions;

export const openCheckModal = CheckModal.open;
export const openCheckLibrary = CheckModal.openLibrary;
export const applyPreset = CheckModal.applyPreset;
export const applyLibraryChanges = CheckModal.saveLibraryChanges;

export const openManualInput = ExerciseModal.open;

export const openActionMenu = ActionMenu.open;
export const handleActionSelect = ActionMenu.handleSelect;

// 汎用・その他
export const closeModal = (id) => toggleModal(id, false);

// ★復元: 初回セットアップ対応のHelpモーダル
export const openHelp = (isFirstTime = false) => {
    toggleModal('help-modal', true);
    
    const footerBtn = document.querySelector('#help-modal button.w-full');
    if (footerBtn) {
        if (isFirstTime) {
            footerBtn.textContent = "Start Setup";
            footerBtn.onclick = () => {
                toggleModal('help-modal', false);
                // Settingsタブへ移動
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

// Timer関連
export const openTimer = (reset = false) => {
    if (reset) Timer.reset();
    toggleModal('timer-modal', true);
    Timer.init();
};
export const closeTimer = () => {
    toggleModal('timer-modal', false);
};

export const updateInputSuggestions = () => {}; 
export const renderQuickButtons = () => {}; 
export const openLogDetail = () => {}; 
export const updateModeSelector = () => {};