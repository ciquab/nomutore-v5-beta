import { escapeHtml } from '../../ui/dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const LogItem = (log, isEditMode, index = 0) => {
    // アニメーション遅延
    const delayStyle = `animation-delay: ${Math.min(index * 0.05, 0.3)}s`;

    const checkboxHtml = isEditMode 
        ? `<div class="mr-2">
             <input type="checkbox" class="log-checkbox checkbox checkbox-sm checkbox-primary rounded-md" value="${log.id}">
           </div>`
        : '';

    let iconHtml = '', mainText = '', subText = '', rightContent = '', typeClass = '';
    let icon = '';

    if (log.type === 'beer') {
        typeClass = 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500';
        icon = '🍺';
        
        const brewery = log.brewery ? `<span class="text-[10px] opacity-60 block leading-tight mb-0.5 font-bold uppercase tracking-wide">${escapeHtml(log.brewery)}</span>` : '';
        mainText = log.brand ? `${brewery}${escapeHtml(log.brand)}` : escapeHtml(log.name);
        
        const styleInfo = log.style ? ` · ${log.style}` : '';
        const vol = log.rawAmount || log.size || 350;
        const countStr = log.count > 1 ? ` x${log.count}` : '';
        
        subText = `${countStr}${vol}ml${styleInfo} <span class="opacity-60">(${Math.abs(Math.round(log.kcal))}kcal)</span>`;
        
        if (log.rating > 0) {
            rightContent = `<div class="flex items-center bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded-lg"><span class="text-xs font-bold text-yellow-600 dark:text-yellow-400">★${log.rating}</span></div>`;
        }

    } else if (log.type === 'exercise') {
        typeClass = 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400';
        // EXERCISE定数がここから見えない場合、簡易アイコンを使用（または引数で渡す）
        // アイコンロジックをここに持ってくるか、単純化する
        icon = '🏃'; 
        
        mainText = escapeHtml(log.name || 'Exercise');
        subText = `<span class="font-bold text-gray-600 dark:text-gray-300">${log.minutes} min</span> · -${Math.round(log.kcal)} kcal`;
        rightContent = `<span class="text-sm font-black text-indigo-500">-${Math.round(log.kcal)}</span>`;
    }

    const memoHtml = log.memo 
        ? `<div class="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-2 py-1.5 rounded-lg inline-block max-w-full"><i class="ph-bold ph-note-pencil mr-1 opacity-70"></i>${escapeHtml(log.memo)}</div>` 
        : '';

    // クラス名などは元のコード(UI改善版)を再現
    return `
        <li class="log-item relative group bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm flex items-center gap-4 mb-3 transition-all active:scale-[0.98] border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900"
            style="${delayStyle}"
            onclick="UI.editLog(${log.id})">
            
            ${checkboxHtml}
            
            <div class="w-12 h-12 text-xl rounded-full ${typeClass} flex items-center justify-center shrink-0 shadow-inner">
                ${icon}
            </div>
            
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start">
                    <div class="text-base font-black text-gray-900 dark:text-gray-50 leading-snug">${mainText}</div>
                    <div class="ml-2 flex-shrink-0">${rightContent}</div>
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate font-bold opacity-90">${subText}</div>
                ${memoHtml}
            </div>
        </li>
    `;
};