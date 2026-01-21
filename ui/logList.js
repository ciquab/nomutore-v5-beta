import { db } from '../store.js';
import { DOM, escapeHtml } from './dom.js';
import { EXERCISE, CALORIES } from '../constants.js';
import { StateManager } from './state.js';
import { Service } from '../service.js'; 
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';
import { LogItem } from './components/LogItem.js';

// 状態管理
let currentLimit = 20; // 最初に表示する件数
const LIMIT_STEP = 20; // 追加で読み込む件数

// ★変数定義を追加 (ReferenceError回避)
let _fetchLogsFn = null;

export const toggleEditMode = () => {
    const isEdit = !StateManager.isEditMode;
    StateManager.setIsEditMode(isEdit);
    
    // UI反映
    updateLogListView(false); 
    
    const selectAllBtn = document.getElementById('btn-select-all');
    if (selectAllBtn) {
        if (isEdit) selectAllBtn.classList.remove('hidden');
        else selectAllBtn.classList.add('hidden');
    }
    
    updateBulkActionUI();
};

export const toggleSelectAll = () => {
    const checkboxes = document.querySelectorAll('.log-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    updateBulkActionUI();
};

export const updateBulkCount = () => {
    updateBulkActionUI();
};

const updateBulkActionUI = () => {
    const count = document.querySelectorAll('.log-checkbox:checked').length;
    
    const toolbar = document.getElementById('edit-toolbar');
    if (toolbar) toolbar.classList.toggle('hidden', !StateManager.isEditMode);
    
    const deleteBtn = document.getElementById('btn-delete-selected');
    if (deleteBtn) {
        deleteBtn.disabled = count === 0;
        deleteBtn.innerHTML = `<i class="ph-bold ph-trash"></i> Delete (${count})`;
        
        // 編集モードでなければ隠す (translate-y-20 opacity-0 クラスで制御)
        if(StateManager.isEditMode) {
             deleteBtn.classList.remove('translate-y-20', 'opacity-0');
        } else {
             deleteBtn.classList.add('translate-y-20', 'opacity-0');
        }
    }
    
    const countLabel = document.getElementById('bulk-selected-count');
    if (countLabel) countLabel.textContent = count;
};

export const deleteSelectedLogs = async () => {
    const checkboxes = document.querySelectorAll('.log-checkbox:checked');
    if (checkboxes.length === 0) return;

    // ★修正1: ここでの confirm() を削除 (Service側で行うため、2重表示を防止)
    
    // ★修正2: dataset.id ではなく value から取得 (LogItemの実装に合わせる)
    const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    try {
        await Service.bulkDeleteLogs(ids);
        StateManager.setIsEditMode(false);
        updateBulkActionUI();
        await updateLogListView(false); 
    } catch (e) {
        console.error(e);
        // Service側でもエラー表示している場合はここでのalertは不要だが、念のため残すか削除してもよい
    }
};

// ハンドラ設定関数
export const setFetchLogsHandler = (fn) => { _fetchLogsFn = fn; };

/**
 * ログリストを更新する
 */
export const updateLogListView = async (reset = false) => {
    const listEl = document.getElementById('log-list');
    const loadMoreBtn = document.getElementById('btn-load-more');
    if (!listEl) return;

    if (reset) {
        currentLimit = 20;
    }

    let logs = [];
    if (_fetchLogsFn) {
        logs = await _fetchLogsFn();
    } else {
        logs = await db.logs.orderBy('timestamp').reverse().toArray();
    }

    const totalCount = logs.length;
    const displayLogs = logs.slice(0, currentLimit);

    listEl.innerHTML = '';

    if (logs.length === 0) {
        listEl.innerHTML = `<li class="text-center text-gray-400 py-10 text-xs flex flex-col items-center"><i class="ph-duotone ph-beer-bottle text-4xl mb-2"></i>No logs yet.</li>`;
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
        // データがない場合もUI更新（ボタンを隠すため）
        updateBulkActionUI();
        return;
    }

    let currentDateStr = '';

    displayLogs.forEach((log, index) => {
        const dateStr = dayjs(log.timestamp).format('YYYY-MM-DD (ddd)');
        
        if (dateStr !== currentDateStr) {
            listEl.insertAdjacentHTML('beforeend', `
                <li class="sticky top-[-1px] z-20 bg-base-50/95 dark:bg-base-900/95 backdrop-blur-sm py-2 px-1 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-900/50 mb-3 mt-1">
                    <span>${dateStr}</span>
                </li>
            `);
            currentDateStr = dateStr;
        }

        listEl.insertAdjacentHTML('beforeend', LogItem(log, StateManager.isEditMode, index));
    });

    if (loadMoreBtn) {
        if (totalCount > currentLimit) {
            loadMoreBtn.classList.remove('hidden');
            loadMoreBtn.textContent = `Load More (${totalCount - currentLimit} remaining)`;
            loadMoreBtn.onclick = () => {
                currentLimit += LIMIT_STEP;
                updateLogListView(false); 
            };
        } else {
            loadMoreBtn.classList.add('hidden');
        }
    }
    
    document.querySelectorAll('.log-checkbox').forEach(cb => {
        cb.addEventListener('change', updateBulkCount);
        cb.addEventListener('click', (e) => e.stopPropagation());
    });
    
    // ★修正3: 最後に必ずUI状態を更新して、ボタンの表示/非表示を同期する
    updateBulkActionUI();
};

// 外部参照用
updateLogListView.updateBulkCount = updateBulkCount;