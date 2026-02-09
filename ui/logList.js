// @ts-check
import { db } from '../store.js';
import { DOM, escapeHtml, Feedback, AudioEngine } from './dom.js';
import { EXERCISE, CALORIES, STYLE_METADATA } from '../constants.js';
import { StateManager } from './state.js';
import { Service } from '../service.js'; 
import { openLogDetail } from './logDetail.js';
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

    if (!confirm(`合計 ${checkboxes.length} 件の記録を削除しますか？`)) return;

    const ids = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));
    
   try {
        // --- ★ここを追加！ブラウザの権限があるこの瞬間に鳴らす ---
        if (typeof AudioEngine !== 'undefined') AudioEngine.resume();
        if (typeof Feedback !== 'undefined' && Feedback.delete) {
            Feedback.delete(); // 「シュッ」という音
        }
        // -----------------------------------------------------

        await Service.bulkDeleteLogs(ids);
        
        StateManager.setIsEditMode(false);
        updateBulkActionUI();
        await updateLogListView(false); 
    } catch (e) {
        console.error(e);
        alert('記録の削除に失敗しました。');
    }
};


// リスト描画のメイン関数 (Phase 2 Optimized)

/**
 * ログリストの描画（最適化版）
 * @param {boolean} isLoadMore - 追加読み込みかどうか
 * @param {Array} providedLogs - [新設] 外部から渡されたデータ（二重取得防止用）
 */

// 引数に providedLogs を追加
export const updateLogListView = async (isLoadMore = false, providedLogs = null) => {
    const listEl = document.getElementById('log-list');
    const loadMoreBtn = document.getElementById('btn-load-more');
    if (!listEl) return;

    if (isLoadMore) {
        currentLimit += LIMIT_STEP;
    } else {
        currentLimit = 20; 
    }

    // --- ★修正点: データの取得をスマートにする ---
    let sortedLogs;
    if (providedLogs) {
        // refreshUIから渡されたデータを使う（爆速）
        sortedLogs = providedLogs.sort((a, b) => b.timestamp - a.timestamp);
    } else {
        // 直接呼ばれた時だけDBから取る
        const { allLogs } = await Service.getAppDataSnapshot();
        sortedLogs = allLogs.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    const totalCount = sortedLogs.length;
    const logs = sortedLogs.slice(0, currentLimit);

    const fragment = document.createDocumentFragment();

    if (logs.length === 0) {
        listEl.innerHTML = `<li class="text-center text-gray-400 py-10 text-xs flex flex-col items-center"><i class="ph-duotone ph-beer-bottle text-4xl mb-2"></i>No logs yet.</li>`;
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
        return;
    }

    let currentDateStr = '';

    logs.forEach((log, index) => {
        const dateStr = dayjs(log.timestamp).format('YYYY-MM-DD (ddd)');
        
        if (dateStr !== currentDateStr) {
            const header = document.createElement('li');
            header.className = "sticky top-[-1px] z-20 bg-base-50/95 dark:bg-base-900/95 backdrop-blur-sm py-2 px-1 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-900/50 mb-3 mt-1";
            header.innerHTML = `<span>${dateStr}</span>`;
            fragment.appendChild(header);
            currentDateStr = dateStr;
        }

        const li = document.createElement('li');
        li.className = "log-item relative group bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm flex items-center gap-4 mb-3 transition-all active:scale-[0.98] border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900 cursor-pointer group";
        li.style.animationDelay = `${Math.min(index * 0.05, 0.3)}s`;
        li.dataset.logId = log.id;
        
        const iconDef = log.type === 'exercise' 
            ? (EXERCISE[log.exerciseKey]?.icon || 'ph-duotone ph-sneaker-move')
            : (STYLE_METADATA[log.style]?.icon || 'ph-duotone ph-beer-bottle');

        const colorClass = log.type === 'exercise' 
            ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' 
            : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500';

        let mainText = log.type === 'beer' && log.brand 
            ? (log.brewery ? `<span class="text-[10px] opacity-60 block leading-tight mb-0.5 font-bold uppercase tracking-wide">${escapeHtml(log.brewery)}</span>${escapeHtml(log.brand)}` : escapeHtml(log.brand))
            : escapeHtml(log.name);

        let subText = log.type === 'exercise'
            ? `<span class="font-bold text-gray-600 dark:text-gray-300">${log.minutes} min</span> · -${Math.round(log.kcal)} kcal`
            : `${log.count || 1} cans <span class="opacity-60">(${(log.size || 350) * (log.count || 1)}ml)</span>${log.style ? ` · ${log.style}` : ''}`;

        let rightContent = log.type === 'exercise'
            ? `<span class="text-sm font-black text-indigo-500">+${Math.round(log.kcal)}</span>`
            : (log.rating > 0 ? `<div class="flex items-center bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded-lg"><span class="text-xs font-bold text-yellow-600 dark:text-yellow-400">★${log.rating}</span></div>` : '');

        const iconHtml = DOM.renderIcon(iconDef, 'text-2xl');
        const checkboxHtml = StateManager.isEditMode ? `
            <div class="mr-2">
                <input type="checkbox" class="log-checkbox checkbox checkbox-sm checkbox-primary rounded-md" data-id="${log.id}">
            </div>
        ` : '';

        li.innerHTML = `
            ${checkboxHtml}
            <div class="w-12 h-12 rounded-full ${colorClass} flex items-center justify-center shrink-0 shadow-inner">
                ${iconHtml}
            </div>
            <div class="flex-1 min-w-0" data-log-id="${log.id}">
                <div class="flex justify-between items-start">
                    <div class="text-base font-bold text-gray-900 dark:text-gray-50 leading-snug">${mainText}</div>
                    <div class="ml-2 flex-shrink-0">${rightContent}</div>
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate font-medium opacity-90">${subText}</div>
                ${log.memo ? `<div class="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-2 py-1.5 rounded-lg inline-block max-w-full"><i class="ph-bold ph-note-pencil mr-1 opacity-70"></i>${escapeHtml(log.memo)}</div>` : ''}
            </div>
        `;
        
        fragment.appendChild(li);
    });

    // --- 【修正点2】描画を一本化し、リスナーの重複登録を削除 ---
    listEl.innerHTML = '';
    listEl.appendChild(fragment);

    if (loadMoreBtn) {
        loadMoreBtn.classList.toggle('hidden', totalCount <= currentLimit);
        if (totalCount > currentLimit) {
            loadMoreBtn.textContent = `Load More (${totalCount - currentLimit} remaining)`;
            // ボタンのリスナーも重複防止のため一度クリアして登録
            loadMoreBtn.onclick = () => updateLogListView(true, sortedLogs);
        }
    }
};

// --- 【修正点3】イベント委譲（関数の外で1回だけ登録） ---
document.addEventListener('click', async (e) => { 
    const listEl = document.getElementById('log-list');
    if (!listEl || !listEl.contains(e.target)) return;
    if (StateManager.isEditMode) return;

    const clickableArea = e.target.closest('[data-log-id]');
    if (clickableArea) {
        const logId = parseInt(clickableArea.dataset.logId);
        
        // ★修正ポイント：IDからログデータを取得する
        const log = await db.logs.get(logId);
        
        if (log) {
            // データが正しく取得できたら、オブジェクトを渡して開く
            openLogDetail(log);
        }
    }
});

// チェックボックス用の委譲
document.addEventListener('change', (e) => {
    if (e.target.classList.contains('log-checkbox')) {
        updateBulkCount();
    }
});
// モジュール外から呼べるように割り当て
updateLogListView.updateBulkCount = updateBulkCount;

// ダミー関数（互換性維持）

export const setFetchLogsHandler = (fn) => {};





