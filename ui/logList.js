import { db } from '../store.js';
import { DOM, escapeHtml } from './dom.js';
import { EXERCISE, CALORIES } from '../constants.js';
import { StateManager } from './state.js';
import { Service } from '../service.js'; 
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
export const updateLogListView = async (isLoadMore = false) => {
    const listEl = document.getElementById('log-list');
    const loadMoreBtn = document.getElementById('btn-load-more');
    if (!listEl) return;

    if (isLoadMore) {
        currentLimit += LIMIT_STEP;
    }

    // データ取得
    const totalCount = await db.logs.count();
    const logs = await db.logs.orderBy('timestamp').reverse().limit(currentLimit).toArray();

    listEl.innerHTML = '';

    if (logs.length === 0) {
        listEl.innerHTML = `<li class="text-center text-gray-400 py-10 text-xs flex flex-col items-center"><i class="ph-duotone ph-beer-bottle text-4xl mb-2"></i>No logs yet.</li>`;
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
        return;
    }

    let currentDateStr = '';

    logs.forEach((log, index) => {
        // ★日付のみ表示（時間は削除）
        const dateStr = dayjs(log.timestamp).format('YYYY-MM-DD (ddd)');
        
        // 【UI改善】 Sticky Headerで見やすく
        if (dateStr !== currentDateStr) {
            const header = document.createElement('li');
            // sticky top-[-1px] z-10 によりスクロール時に日付が追従します
            // 背景にブラーを入れて読みやすく
            header.className = "sticky top-[-1px] z-20 bg-base-50/95 dark:bg-base-900/95 backdrop-blur-sm py-2 px-1 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-indigo-100 dark:border-indigo-900/50 mb-3 mt-1";
            header.innerHTML = `<span>${dateStr}</span>`;
            listEl.appendChild(header);
            currentDateStr = dateStr;
        }

        const li = document.createElement('li');
        // 【UI改善】 p-3 -> p-4, gap-3 -> gap-4 でゆとりを持たせる
        // アニメーション用のクラス log-item を追加
        li.className = "log-item relative group bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm flex items-center gap-4 mb-3 transition-all active:scale-[0.98] border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900";
        
        // アニメーション用遅延 (リストがパラパラと表示される演出)
        li.style.animationDelay = `${Math.min(index * 0.05, 0.3)}s`;
        
        // 【UI改善】 アイコンサイズ拡大 w-10 -> w-12
        let iconSizeClass = "w-12 h-12 text-xl";
        let colorClass = 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500';
        let icon = '🍺';
        let mainText = '';
        let subText = '';
        let rightContent = '';

        if (log.type === 'exercise') {
            const ex = EXERCISE[log.exerciseKey];
            icon = ex ? ex.icon : '🏃';
            colorClass = 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400';
            mainText = log.name; 
            subText = `<span class="font-bold text-gray-600 dark:text-gray-300">${log.minutes} min</span> · -${Math.round(log.kcal)} kcal`;
            rightContent = `<span class="text-sm font-black text-indigo-500">-${Math.round(log.kcal)}</span>`;
        } else if (log.type === 'beer') {
            const size = log.size || 350;
            const count = log.count || 1;
            
            if (log.brand) {
                // 【UI改善】 ブランド名を強調、ブルワリー名は少し控えめに（階層構造の明確化）
                mainText = log.brewery ? `<span class="text-[10px] opacity-60 block leading-tight mb-0.5 font-bold uppercase tracking-wide">${escapeHtml(log.brewery)}</span>${escapeHtml(log.brand)}` : escapeHtml(log.brand);
            } else {
                mainText = escapeHtml(log.name); 
            }

            const styleInfo = log.style ? ` · ${log.style}` : ''; 
            const totalMl = size * count;
            subText = `${count} cans <span class="opacity-60">(${totalMl}ml)</span>${styleInfo}`;
            
            if(log.rating > 0) {
                // 星評価のデザイン調整
                rightContent = `<div class="flex items-center bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded-lg"><span class="text-xs font-bold text-yellow-600 dark:text-yellow-400">★${log.rating}</span></div>`;
            }
        }

        // チェックボックス (編集モード時のみ表示)
        const checkboxHtml = StateManager.isEditMode ? `
            <div class="mr-2">
                <input type="checkbox" class="log-checkbox checkbox checkbox-sm checkbox-primary rounded-md" data-id="${log.id}">
            </div>
        ` : '';

        li.innerHTML = `
            ${checkboxHtml}
            <div class="${iconSizeClass} rounded-full ${colorClass} flex items-center justify-center shrink-0 shadow-inner">
                ${icon}
            </div>

            <div class="flex-1 min-w-0 cursor-pointer" onclick="UI.editLog(${log.id})">
                <div class="flex justify-between items-start">
                    <!-- 【UI改善】 text-sm -> text-base, font-black で視認性向上 -->
                    <div class="text-base font-black text-gray-900 dark:text-gray-50 leading-snug">${mainText}</div>
                    <div class="ml-2 flex-shrink-0">${rightContent}</div>
                </div>
                <!-- 【UI改善】 text-[11px] -> text-xs, 色を少し濃くして読みやすく -->
                <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate font-bold opacity-90">${subText}</div>
                
                ${log.memo ? `<div class="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-2 py-1.5 rounded-lg inline-block max-w-full"><i class="ph-bold ph-note-pencil mr-1 opacity-70"></i>${escapeHtml(log.memo)}</div>` : ''}
            </div>
        `;
        
        listEl.appendChild(li);
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