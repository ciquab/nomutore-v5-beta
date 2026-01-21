import { db } from '../store.js';
import { DOM, escapeHtml } from './dom.js';
import { EXERCISE, CALORIES } from '../constants.js';
import { StateManager } from './state.js';
import { Service } from '../service.js'; 
import { LogItem } from './components/LogItem.js';

import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// 状態管理
let currentLimit = 20; // 最初に表示する件数
const LIMIT_STEP = 20; // 追加で読み込む件数

export const toggleEditMode = () => {
    const isEdit = !StateManager.isEditMode;
    StateManager.setIsEditMode(isEdit);
    
    // UI反映
    updateLogListView(false); // 再描画してチェックボックスを表示
    
    // Select Allボタンの表示制御
    const selectAllBtn = document.getElementById('btn-select-all');
    if (selectAllBtn) {
        if (isEdit) selectAllBtn.classList.remove('hidden');
        else selectAllBtn.classList.add('hidden');
    }
    
    updateBulkActionUI();
};

export const toggleSelectAll = () => {
    const checkboxes = document.querySelectorAll('.log-checkbox');
    // 全てチェック済みなら解除、そうでなければ全選択
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    updateBulkActionUI();
};

// 選択状態に応じてアクションバー（削除ボタン等）の表示を更新
export const updateBulkCount = () => {
    updateBulkActionUI();
};

const updateBulkActionUI = () => {
    const count = document.querySelectorAll('.log-checkbox:checked').length;
    
    // 編集モードツールバー（Select Allなど）の制御
    const toolbar = document.getElementById('edit-toolbar'); // HTMLに存在すれば
    if (toolbar) toolbar.classList.toggle('hidden', !StateManager.isEditMode);
    
    // 一括削除ボタンエリア
    const deleteBtn = document.getElementById('btn-delete-selected');
    if (deleteBtn) {
        deleteBtn.disabled = count === 0;
        deleteBtn.innerHTML = `<i class="ph-bold ph-trash"></i> Delete (${count})`;
        // ボタンの表示/非表示
        if(StateManager.isEditMode) {
             deleteBtn.classList.remove('translate-y-20', 'opacity-0');
        } else {
             deleteBtn.classList.add('translate-y-20', 'opacity-0');
        }
    }
    
    // 既存のツールバー内カウント更新（もしあれば）
    const countLabel = document.getElementById('bulk-selected-count');
    if (countLabel) countLabel.textContent = count;
};

// 選択されたログを一括削除
export const deleteSelectedLogs = async () => {
    const checkboxes = document.querySelectorAll('.log-checkbox:checked');
    if (checkboxes.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${checkboxes.length} items?`)) return;

    const ids = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));
    
    try {
    // Service側のメソッドを呼ぶ（ここでDB削除、再計算、UI更新イベント発行まで行われる）
    await Service.bulkDeleteLogs(ids);

    // 編集モード解除とUI更新のみこちらで行う
    StateManager.setIsEditMode(false);
    updateBulkActionUI();
    
    // updateLogListViewは Service が発火する 'refresh-ui' イベント、
    // あるいはService完了後に呼ぶ形でも良いが、Service.bulkDeleteLogs内で
    // UI更新イベントが呼ばれる設計なら重複を避ける。
    // 現状のService.bulkDeleteLogsの実装を見ると refresh-ui を投げているので、
    // ここでの updateLogListView 呼び出しは不要、または念のため呼ぶ程度。
    await updateLogListView(false); 
} catch (e) {
    console.error(e);
    alert('Failed to delete logs.');
}
};


// リスト描画のメイン関数
// isLoadMore: trueなら件数を増やして再描画
export const updateLogListView = async (reset = false) => {
    const listEl = document.getElementById('log-list');
    const loadMoreBtn = document.getElementById('btn-load-more');
    if (!listEl) return;

    if (reset) currentLimit = 20;

    let logs = [];
    if (_fetchLogsFn) {
        logs = await _fetchLogsFn();
    } else {
        logs = await db.logs.orderBy('timestamp').reverse().toArray();
    }

    const totalCount = logs.length;
    const displayLogs = logs.slice(0, currentLimit);

    // ★重要: innerHTMLを空にしてから、DOM要素（文字列）を追記していく
    listEl.innerHTML = '';

    if (logs.length === 0) {
        listEl.innerHTML = `<li class="text-center text-gray-400 py-10 text-xs flex flex-col items-center"><i class="ph-duotone ph-beer-bottle text-4xl mb-2"></i>No logs yet.</li>`;
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
        return;
    }

    let currentDateStr = '';

    // ★修正: map().join('') は使わず、forEachで1つずつ処理してHeaderを挟む
    displayLogs.forEach((log, index) => {
        const dateStr = dayjs(log.timestamp).format('YYYY-MM-DD (ddd)');
        
        // Sticky Headerの挿入
        if (dateStr !== currentDateStr) {
            // 文字列として追加
            listEl.insertAdjacentHTML('beforeend', `
                <li class="sticky top-[-1px] z-20 bg-base-50/95 dark:bg-base-900/95 backdrop-blur-sm py-2 px-1 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-900/50 mb-3 mt-1">
                    <span>${dateStr}</span>
                </li>
            `);
            currentDateStr = dateStr;
        }

        // アイテム本体の挿入 (LogItemコンポーネントを使用)
        // insertAdjacentHTMLを使うことで、HTML文字列をパースして追加できる
        listEl.insertAdjacentHTML('beforeend', LogItem(log, StateManager.isEditMode, index));
    });

    // 「Load More」ボタンの表示制御
    if (loadMoreBtn) {
        if (totalCount > currentLimit) {
            loadMoreBtn.classList.remove('hidden');
            loadMoreBtn.textContent = `Load More (${totalCount - currentLimit} remaining)`;
            loadMoreBtn.onclick = () => updateLogListView(true);
        } else {
            loadMoreBtn.classList.add('hidden');
        }
    }
    
    // イベントリスナー再設定
    document.querySelectorAll('.log-checkbox').forEach(cb => {
        cb.addEventListener('change', updateBulkCount);
    });
};

// モジュール外から呼べるように割り当て
updateLogListView.updateBulkCount = updateBulkCount;

// ダミー関数（互換性維持）
export const setFetchLogsHandler = (fn) => {};