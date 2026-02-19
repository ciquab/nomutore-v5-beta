// ui/alcoholMeter.js
// @ts-check
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// 週間アルコール上限は Calc.getWeeklyAlcoholLimit(profile) で体重ベースに算出

/**
 * Weekly Alcohol Meter の描画
 * @param {import('../types.js').Log[]} allLogs - 全期間ログ
 */
export function renderAlcoholMeter(allLogs) {
    const container = document.getElementById('alcohol-meter-card');
    if (!container) return;

    const profile = Store.getProfile();
    const limit = Calc.getWeeklyAlcoholLimit(profile);

    // 今週（月曜〜日曜）のログを抽出
    const now = dayjs();
    const currentDay = now.day() || 7; // Sun(0) → 7
    const startOfWeek = now.subtract(currentDay - 1, 'day').startOf('day');

    const weeklyLogs = allLogs.filter(l =>
        l.type === 'beer' && l.timestamp >= startOfWeek.valueOf()
    );

    const totalAlcohol = Calc.calcTotalPureAlcohol(weeklyLogs);
    const pct = Math.min(Math.round((totalAlcohol / limit) * 100), 100);
    const overLimit = totalAlcohol > limit;

    // 色の決定
    let barColor, textColor, bgColor;
    if (pct <= 50) {
        barColor = 'bg-emerald-500';
        textColor = 'text-emerald-600 dark:text-emerald-400';
        bgColor = 'bg-emerald-100 dark:bg-emerald-900/30';
    } else if (pct <= 80) {
        barColor = 'bg-amber-500';
        textColor = 'text-amber-600 dark:text-amber-400';
        bgColor = 'bg-amber-100 dark:bg-amber-900/30';
    } else {
        barColor = 'bg-red-500';
        textColor = 'text-red-600 dark:text-red-400';
        bgColor = 'bg-red-100 dark:bg-red-900/30';
    }

    const statusText = overLimit
        ? 'ガイドライン超過'
        : totalAlcohol === 0
            ? '今週はまだ飲んでいません'
            : `ガイドラインの ${pct}%`;

    container.innerHTML = `
        <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><i class="ph-fill ph-wine" aria-hidden="true"></i> Weekly Alcohol</h3>
            <span class="text-[11px] font-bold ${textColor}">
                ${Math.round(totalAlcohol)}g / ${limit}g
            </span>
        </div>

        <div class="w-full h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-2">
            <div class="${barColor} h-full rounded-full transition-all duration-500 ease-out"
                 style="width: ${pct}%"></div>
        </div>

        <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-gray-500 dark:text-gray-400">${statusText}</span>
            ${overLimit ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${bgColor} ${textColor}">Over</span>` : ''}
        </div>
    `;
}
