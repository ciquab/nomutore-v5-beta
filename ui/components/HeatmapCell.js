import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// スマホ対応: アイコンを2つ並べるためのヘルパー
const dualIconWrapper = (icon1, icon2) => `
    <div class="flex items-center justify-center gap-[1px] transform scale-90">
        ${icon1}
        ${icon2}
    </div>
`;

export const HeatmapCell = (dateObj, status, isToday) => {
    let bgClass = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700";
    let textClass = "text-gray-400";
    let borderClass = "border";
    let iconHtml = '';

    // ★元のコードのロジックをここに移植
    switch (status) {
        case 'rest_exercise': // 休肝日 + 運動 (最強)
            bgClass = "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700";
            textClass = "text-emerald-600 dark:text-emerald-400";
            iconHtml = dualIconWrapper(
                `<i class="ph-fill ph-coffee text-xs"></i>`,
                `<i class="ph-fill ph-person-simple-run text-xs"></i>`
            );
            break;

        case 'rest': // 休肝日のみ (Green)
            bgClass = "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800";
            textClass = "text-emerald-500 dark:text-emerald-500";
            iconHtml = `<i class="ph-fill ph-coffee text-lg"></i>`;
            break;

        case 'drink_exercise_success': // 完済 (Indigo/Blue)
            bgClass = "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700";
            textClass = "text-indigo-600 dark:text-indigo-400";
            iconHtml = dualIconWrapper(
                `<i class="ph-fill ph-beer-stein text-xs"></i>`,
                `<i class="ph-bold ph-check text-xs"></i>`
            );
            break;

        case 'drink_exercise': // 未完済 (Cyan/Blue)
            bgClass = "bg-sky-100 dark:bg-sky-900/30 border-sky-200 dark:border-sky-700";
            textClass = "text-sky-600 dark:text-sky-400";
            iconHtml = dualIconWrapper(
                `<i class="ph-fill ph-beer-stein text-xs"></i>`,
                `<i class="ph-fill ph-person-simple-run text-xs"></i>`
            );
            break;

        case 'drink': // 飲酒のみ (Red)
            bgClass = "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800";
            textClass = "text-red-500 dark:text-red-500";
            iconHtml = `<i class="ph-fill ph-beer-stein text-lg"></i>`;
            break;

        case 'exercise': // 運動のみ (Blue)
            bgClass = "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800";
            textClass = "text-blue-600 dark:text-blue-400";
            iconHtml = `<i class="ph-fill ph-person-simple-run text-lg"></i>`;
            break;
            
        default:
            // 未来か過去か
            if (dateObj.isAfter(dayjs(), 'day')) {
                 bgClass = "bg-transparent border border-dashed border-gray-200 dark:border-gray-700 opacity-30";
            }
            iconHtml = `<span class="text-[10px] font-bold opacity-30 font-mono">${dateObj.format('D')}</span>`;
            break;
    }

    if (isToday) {
        borderClass = "border-2 border-indigo-500 dark:border-indigo-400 shadow-md shadow-indigo-500/20";
        // 今日の場合は z-index を上げてボーダーを強調
    }

    // HTML文字列を返す
    return `
        <div class="heatmap-cell aspect-square rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer relative group ${bgClass} ${textClass} ${borderClass}"
             onclick="UI.openCheckModal('${dateObj.format('YYYY-MM-DD')}')">
            <span class="text-sm leading-none select-none filter drop-shadow-sm transition-transform group-hover:-translate-y-0.5">
                ${iconHtml}
            </span>
            ${isToday ? '<span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-500 rounded-full border-2 border-white dark:border-gray-900"></span>' : ''}
        </div>
    `;
};