// ui/weekly.js
// @ts-check
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { DAY_STATUS_STYLES } from '../constants.js';
import { StateManager } from './state.js';
import { DOM } from './dom.js';

import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/**
 * 週間カレンダーとヒートマップを描画する
 * @param {Array} allLogs - 全期間のログデータ
 * @param {Array} checks - 全てのチェックデータ
 */
// ✅ 修正: async を削除（内部でawaitしていないため同期処理とする）
export function renderWeeklyAndHeatUp(allLogs, checks) {
    const profile = Store.getProfile();

    const allLogsForDisplay = allLogs || [];

    // ストリーク計算とバッジ表示
    const streak = Calc.getCurrentStreak(allLogsForDisplay, checks, profile);
    const multiplier = Calc.getStreakMultiplier ? Calc.getStreakMultiplier(streak) : 1.0;
    
    const streakEl = DOM.elements['streak-count'] || document.getElementById('streak-count');
    if(streakEl) streakEl.textContent = String(streak);
    
    const badge = DOM.elements['streak-badge'] || document.getElementById('streak-badge');
    if (badge) {
        if (multiplier > 1.0) {
            badge.innerHTML = `<i class="ph-fill ph-fire-simple mr-1" aria-hidden="true"></i>x${multiplier.toFixed(1)} Bonus`;
            badge.className = "inline-flex items-center px-2 py-0.5 bg-orange-500 text-white text-[11px] font-bold rounded-full shadow-sm animate-pulse";
        } else {
            badge.innerHTML = `<i class="ph-bold ph-trend-flat mr-1" aria-hidden="true"></i>x1.0 Normal`;
            badge.className = "inline-flex items-center px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[11px] font-bold rounded-full border border-gray-200 dark:border-gray-600";
        }
    }

    // ----------------------------------------------------
    // 1. Weekly Calendar (上部の1週間カレンダー)
    // ----------------------------------------------------
    const container = DOM.elements['weekly-calendar'] || document.getElementById('weekly-calendar');
    if (container) {
        // 月曜始まりロジック
        const today = dayjs();
        const currentDay = today.day() || 7; // Sun(0) -> 7
        const startOfWeek = today.subtract(currentDay - 1, 'day');
        
        let html = '';
        
        for (let i = 0; i < 7; i++) {
            const d = startOfWeek.add(i, 'day');
            const isToday = d.isSame(today, 'day');
            const status = Calc.getDayStatus(d, allLogsForDisplay, checks, profile);
            
            const calColors = DAY_STATUS_STYLES.calendar[status] || DAY_STATUS_STYLES.calendar.empty;
            let bgClass = calColors.bg;
            let textClass = calColors.text;
            let borderClass = "border";
            let iconHtml = '';

            switch (status) {
                case 'rest_exercise':
                    iconHtml = `<i class="ph-fill ph-medal text-xl drop-shadow-sm" aria-hidden="true"></i>`;
                    break;
                case 'exercise':
                    iconHtml = `<i class="ph-fill ph-medal text-xl text-gray-500 dark:text-gray-400 dark:text-gray-300" aria-hidden="true"></i>`;
                    break;
                case 'rest':
                    iconHtml = `<i class="ph-fill ph-coffee text-lg" aria-hidden="true"></i>`;
                    break;
                case 'drink_exercise_success':
                    iconHtml = `<i class="ph-fill ph-fire text-xl text-orange-500 dark:text-orange-400" aria-hidden="true"></i>`;
                    break;
                case 'drink_exercise':
                    iconHtml = `<div class="flex items-center justify-center gap-[1px] transform scale-90"><i class="ph-fill ph-beer-stein text-xs" aria-hidden="true"></i><i class="ph-fill ph-person-simple-run text-xs" aria-hidden="true"></i></div>`;
                    break;
                case 'drink':
                    iconHtml = `<i class="ph-fill ph-beer-stein text-lg" aria-hidden="true"></i>`;
                    break;
                default:
                    iconHtml = `<span class="text-[11px] font-semibold opacity-30 font-mono">${d.format('D')}</span>`;
                    break;
            }

            if (isToday) {
                borderClass = "border-2 border-indigo-500 dark:border-indigo-400 shadow-md shadow-indigo-500/20";
            }

            html += `
                <div class="aspect-square rounded-xl ${bgClass} ${borderClass} flex items-center justify-center ${textClass} transition-all hover:scale-105 active:scale-95 cursor-pointer relative group"
                     data-action="ui:openDayDetail" data-args='{"date": "${d.format('YYYY-MM-DD')}"}'>
                    ${iconHtml}
                    ${isToday ? '<span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-500 rounded-full border-2 border-white dark:border-gray-900"></span>' : ''}
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        const label = document.getElementById('weekly-range-label');
        if (label) {
            const endOfWeek = startOfWeek.add(6, 'day');
            label.textContent = `${startOfWeek.format('M/D')} - ${endOfWeek.format('M/D')}`;
        }
    }

    // ----------------------------------------------------
    // 2. Heatmap
    // ----------------------------------------------------
    renderHeatmap(checks, allLogsForDisplay, profile);
}

// ✅ 修正: 引数名を logs -> allLogs に変更し、意味論を統一
export function renderHeatmap(checks, allLogs, profile) {
    const container = DOM.elements['heatmap-grid'] || document.getElementById('heatmap-grid');
    if (!container) return;

    const offsetWeeks = StateManager.heatmapOffset || 0;
    
    // 月曜始まり計算
    const today = dayjs();
    const dayOfWeek = today.day() === 0 ? 7 : today.day(); 
    const thisMonday = today.subtract(dayOfWeek - 1, 'day');

    const daysToShow = 28; 
    const startOfCurrentBlock = thisMonday.subtract(offsetWeeks * 7, 'day');
    const startDate = startOfCurrentBlock.subtract(3, 'week'); 

    let html = '';

    for (let i = 0; i < daysToShow; i++) {
        const d = startDate.add(i, 'day');
        // ✅ 修正: allLogs を使用
        const status = Calc.getDayStatus(d, allLogs, checks, profile);
        const isToday = d.isSame(dayjs(), 'day');
        
        const hmColors = DAY_STATUS_STYLES.heatmap[status] || DAY_STATUS_STYLES.heatmap.empty;
        let bgClass = hmColors.bg;
        let textClass = hmColors.text;
        let iconHtml = "";

        switch(status) {
            case 'rest_exercise':
                iconHtml = `<i class="ph-fill ph-medal text-xl text-yellow-300 drop-shadow-md" aria-hidden="true"></i>`;
                break;
            case 'exercise':
                iconHtml = `<i class="ph-fill ph-medal text-lg text-gray-200 filter drop-shadow-sm" aria-hidden="true"></i>`;
                break;
            case 'rest':
                iconHtml = `<i class="ph-fill ph-coffee text-lg" aria-hidden="true"></i>`;
                break;
            case 'drink_exercise_success':
                iconHtml = `<i class="ph-fill ph-fire text-lg text-orange-200 filter drop-shadow-sm" aria-hidden="true"></i>`;
                break;
            case 'drink_exercise':
                iconHtml = `<i class="ph-fill ph-person-simple-run text-lg" aria-hidden="true"></i>`;
                break;
            case 'drink':
                iconHtml = `<i class="ph-fill ph-beer-stein text-lg" aria-hidden="true"></i>`;
                break;
            default:
                if (d.isAfter(dayjs())) {
                    bgClass = 'bg-transparent border border-dashed border-gray-200 dark:border-gray-700 opacity-50';
                }
                break;
        }
        
        if (isToday) {
            bgClass += ' ring-2 ring-indigo-500 dark:ring-indigo-400 z-10';
        }

        const content = iconHtml ? iconHtml : `<span class="text-[11px] opacity-40 font-mono">${d.format('D')}</span>`;

        html += `
            <div class="heatmap-cell aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition hover:scale-110 active:scale-95 ${bgClass} ${textClass} relative"
                 title="${d.format('YYYY-MM-DD')}: ${status}"
                 data-action="ui:openDayDetail" data-args='{"date": "${d.format('YYYY-MM-DD')}"}'>
                <span class="text-sm leading-none select-none filter drop-shadow-sm">${content}</span>
            </div>
        `;
    }

    container.innerHTML = html;
    
    const label = DOM.elements['heatmap-period-label'] || document.getElementById('heatmap-period-label');
    if (label) {
        const endDate = startDate.add(daysToShow - 1, 'day');
        label.textContent = `${startDate.format('M/D')} - ${endDate.format('M/D')}`;
    }
}
