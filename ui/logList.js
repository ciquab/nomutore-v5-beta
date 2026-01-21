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

// ★修正: 変数定義を追加 (ReferenceError回避)
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

    if (!confirm(`Are you sure you want to delete ${checkboxes.length} items?`)) return;

    const ids = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));
    
    try {
        await Service.bulkDeleteLogs(ids);
        StateManager.setIsEditMode(false);
        updateBulkActionUI();
        await updateLogListView(false); 
    } catch (e) {
        console.error(e);
        alert('Failed to delete logs.');
    }
};

// ★修正: ハンドラ設定関数を実装
export const setFetchLogsHandler = (fn) => { _fetchLogsFn = fn; };

/**
 * ログリストを更新する
 * @param {boolean} reset - trueなら件数を初期値(20)に戻す。falseなら現在の件数を維持。
 */
export const updateLogListView = async (reset = false) => {
    const listEl = document.getElementById('log-list');
    const loadMoreBtn = document.getElementById('btn-load-more');
    if (!listEl) return;

    // リセットフラグがtrueなら初期件数に戻す
    if (reset) {
        currentLimit = 20;
    }

    // データ取得
    let logs = [];
    // ★修正: 変数が定義されたのでエラーにならなくなる
    if (_fetchLogsFn) {
        logs = await _fetchLogsFn();
    } else {
        logs = await db.logs.orderBy('timestamp').reverse().toArray();
    }

    const totalCount = logs.length;
    // currentLimitを使って表示分だけスライス
    const displayLogs = logs.slice(0, currentLimit);

    listEl.innerHTML = '';

    if (logs.length === 0) {
        listEl.innerHTML = `<li class="text-center text-gray-400 py-10 text-xs flex flex-col items-center"><i class="ph-duotone ph-beer-bottle text-4xl mb-2"></i>No logs yet.</li>`;
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
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

    // 「Load More」ボタン制御
    if (loadMoreBtn) {
        if (totalCount > currentLimit) {
            loadMoreBtn.classList.remove('hidden');
            loadMoreBtn.textContent = `Load More (${totalCount - currentLimit} remaining)`;
            // ★修正: ボタンクリック時はlimitを増やしてから updateLogListView(false) を呼ぶ
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
    
    updateBulkActionUI();
};

// 外部参照用
updateLogListView.updateBulkCount = updateBulkCount;