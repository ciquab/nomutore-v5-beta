// @ts-check
import { LogService } from '../logService.js'; // ✅ db の代わりに LogService を導入
import { DOM, escapeHtml, Feedback, AudioEngine } from './dom.js';
import { EXERCISE, CALORIES, STYLE_METADATA } from '../constants.js';
import { StateManager } from './state.js';
import { Service } from '../service.js'; 
import { openLogDetail } from './logDetail.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// 状態管理
let currentLimit = 20; 
const LIMIT_STEP = 20; 

export const toggleEditMode = () => {
    const isEdit = !StateManager.isEditMode;
    StateManager.setIsEditMode(isEdit);
    
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
    const allChecked = Array.from(checkboxes).every(cb => /** @type {HTMLInputElement} */(cb).checked);
    checkboxes.forEach(cb => (/** @type {HTMLInputElement} */(cb).checked = !allChecked));
    updateBulkActionUI();
};

export const updateBulkCount = () => {
    updateBulkActionUI();
};

const updateBulkActionUI = () => {
    const count = document.querySelectorAll('.log-checkbox:checked').length;
    const toolbar = document.getElementById('edit-toolbar'); 
    if (toolbar) toolbar.classList.toggle('hidden', !StateManager.isEditMode);
    
    const deleteBtn = /** @type {HTMLButtonElement} */(document.getElementById('btn-delete-selected'));
    if (deleteBtn) {
        deleteBtn.disabled = count === 0;
        deleteBtn.innerHTML = `<i class="ph-bold ph-trash" aria-hidden="true"></i> 削除 (${count})`;
        if(StateManager.isEditMode) {
             deleteBtn.classList.remove('translate-y-20', 'opacity-0');
        } else {
             deleteBtn.classList.add('translate-y-20', 'opacity-0');
        }
    }
    
    const countLabel = document.getElementById('bulk-selected-count');
    if (countLabel) countLabel.textContent = String(count);
};

export const deleteSelectedLogs = async () => {
    const checkboxes = document.querySelectorAll('.log-checkbox:checked');
    if (checkboxes.length === 0) return;

    if (!confirm(`合計 ${checkboxes.length} 件の記録を削除しますか？`)) return;

    const ids = Array.from(checkboxes).map(cb => parseInt(/** @type {HTMLInputElement} */(cb).dataset.id || '0'));
    
    try {
        if (typeof AudioEngine !== 'undefined') AudioEngine.resume();
        if (typeof Feedback !== 'undefined' && Feedback.delete) {
            Feedback.delete(); 
        }

        // ✅ 修正: 内部で db.logs.bulkDelete を呼ぶ新 Service メソッド（または LogService 直接）
        // ここでは Service 層の整合性維持のため Service.bulkDeleteLogs を維持します
        // (Service.js 側で LogService を使うよう修正するため)
        await Service.bulkDeleteLogs(ids);
        
        StateManager.setIsEditMode(false);
        updateBulkActionUI();
        await updateLogListView(false); 
    } catch (e) {
        console.error(e);
        alert('記録の削除に失敗しました。');
    }
};

/**
 * ログリストの描画（最適化版）
 * @param {boolean} isLoadMore - 追加読み込みかどうか
 * @param {Array} [providedLogs=null] - 外部から渡されたデータ
 */
export const updateLogListView = async (isLoadMore = false, providedLogs = null) => {
    const listEl = document.getElementById('log-list');
    const loadMoreBtn = document.getElementById('btn-load-more');
    if (!listEl) return;

    if (isLoadMore) {
        currentLimit += LIMIT_STEP;
    } else {
        currentLimit = 20; 
    }

    let sortedLogs;
    if (providedLogs) {
        sortedLogs = [...providedLogs].sort((a, b) => b.timestamp - a.timestamp);
    } else {
        // ✅ 修正点: Service を通じて「調理済み」のデータを取得
        // これにより「収支計算」「キャッシュ更新」「期間フィルタ」が正しく実行される
        const snapshot = await Service.getAppDataSnapshot();
        
        // セラー画面（履歴一覧）では「全履歴」を見せたい場合は snapshot.allLogs を、
        // 設定された期間内だけを見せたい場合は snapshot.logs を使います。
        // 元のロジックに合わせて snapshot.allLogs を採用します。
        sortedLogs = [...snapshot.allLogs].sort((a, b) => b.timestamp - a.timestamp);
    }
    
    const totalCount = sortedLogs.length;
    const logs = sortedLogs.slice(0, currentLimit);

    const fragment = document.createDocumentFragment();

    if (logs.length === 0) {
        listEl.innerHTML = `
            <li class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400 empty-state">
                <i class="ph-duotone ph-beer-bottle text-4xl mb-2" aria-hidden="true"></i>
                <p class="text-sm font-bold">記録はまだありません</p>
                <p class="text-xs opacity-60">Recordタブから最初の1件を追加してみましょう</p>
            </li>
        `;
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
        return;
    }

    let currentDateStr = '';

    logs.forEach((log, index) => {
        const dateStr = dayjs(log.timestamp).format('YYYY-MM-DD (ddd)');
        
        if (dateStr !== currentDateStr) {
            const header = document.createElement('li');
            header.className = "sticky top-[-1px] z-20 bg-base-50/95 dark:bg-base-900/95 backdrop-blur-sm py-2 px-1 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-900/50 mb-3 mt-1";
            header.innerHTML = `<span>${dateStr}</span>`;
            fragment.appendChild(header);
            currentDateStr = dateStr;
        }

        const li = document.createElement('li');
        li.className = "item-row log-item relative group bg-white dark:bg-base-900 rounded-2xl p-4 shadow-sm flex items-center gap-4 mb-3 transition-all active:scale-[0.98] border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900 cursor-pointer group";
        li.style.animationDelay = `${Math.min(index * 0.05, 0.3)}s`;
        li.dataset.logId = log.id;
        
        const iconDef = log.type === 'exercise' 
            ? (EXERCISE[log.exerciseKey]?.icon || 'ph-duotone ph-sneaker-move')
            : (STYLE_METADATA[log.style]?.icon || 'ph-duotone ph-beer-bottle');

        const colorClass = log.type === 'exercise' 
            ? 'bg-indigo-100 text-brand dark:bg-indigo-900/30 dark:text-brand-light' 
            : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500';

        let mainText = log.type === 'beer' && log.brand 
            ? (log.brewery ? `<span class="text-[11px] opacity-60 block leading-tight mb-0.5 font-bold uppercase tracking-wide">${escapeHtml(log.brewery)}</span>${escapeHtml(log.brand)}` : escapeHtml(log.brand))
            : escapeHtml(log.name);

        let subText = log.type === 'exercise'
            ? `<span class="text-gray-500 dark:text-gray-400">${log.minutes}分</span> · +${Math.round(log.kcal)} kcal`
            : `${log.count || 1}本 <span class="opacity-60">(${(log.size || 350) * (log.count || 1)}ml)</span>${log.style ? ` · ${log.style}` : ''}`;

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
                    <div class="text-base font-bold text-base-900 dark:text-white leading-snug">${mainText}</div>
                    <div class="ml-2 flex-shrink-0">${rightContent}</div>
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate font-medium opacity-90">${subText}</div>
                ${log.memo ? `<div class="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-base-50 dark:bg-base-800/50 px-2 py-1.5 rounded-lg inline-block max-w-full"><i class="ph-bold ph-note-pencil mr-1 opacity-70" aria-hidden="true"></i>${escapeHtml(log.memo)}</div>` : ''}
            </div>
        `;
        
        fragment.appendChild(li);
    });

    listEl.innerHTML = '';
    listEl.appendChild(fragment);

    if (loadMoreBtn) {
        loadMoreBtn.classList.toggle('hidden', totalCount <= currentLimit);
        if (totalCount > currentLimit) {
            loadMoreBtn.textContent = `もっと見る（残り ${totalCount - currentLimit} 件）`;
            loadMoreBtn.onclick = () => updateLogListView(true, sortedLogs);
        }
    }
};

// リスナー二重登録防止ガード（モジュール再評価対策）
let _logListListenersAttached = false;
if (!_logListListenersAttached) {
    document.addEventListener('click', async (e) => {
        const listEl = document.getElementById('log-list');
        if (!listEl || !listEl.contains(/** @type {Node} */(e.target))) return;
        if (StateManager.isEditMode) return;

        const clickableArea = /** @type {HTMLElement} */(e.target).closest('[data-log-id]');
        if (clickableArea) {
            const logId = parseInt(clickableArea.dataset.logId || '0');

            // ✅ 修正: 直接 db を見ず、LogService 経由で取得
            const log = await LogService.getById(logId);

            if (log) {
                openLogDetail(log);
            }
        }
    });

    document.addEventListener('change', (e) => {
        if (/** @type {HTMLElement} */(e.target).classList.contains('log-checkbox')) {
            updateBulkCount();
        }
    });
    _logListListenersAttached = true;
}

/** @type {any} */(updateLogListView).updateBulkCount = updateBulkCount;
export const setFetchLogsHandler = (fn) => {};



