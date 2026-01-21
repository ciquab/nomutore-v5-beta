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
export const openHelp = () => toggleModal('help-modal', true);

// Timer関連のラッパー (modal.jsにあったもの)
export const openTimer = (reset = false) => {
    if (reset) Timer.reset();
    toggleModal('timer-modal', true);
    Timer.init();
};
export const closeTimer = () => {
    // 動作中なら確認が必要だが、一旦閉じるだけ
    toggleModal('timer-modal', false);
};

export const updateInputSuggestions = () => {}; // Placeholder
export const renderQuickButtons = () => {}; // Placeholder
export const openLogDetail = () => {}; // Placeholder
export const updateModeSelector = () => {}; // Placeholder