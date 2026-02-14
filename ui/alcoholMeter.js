// ui/alcoholMeter.js
// @ts-check
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/**
 * 厚労省ガイドライン: 男性 週140g / 女性 週70g (1日あたり 男性20g / 女性10g × 7日)
 * ただし一般的には男性週280g(40g/日)を「節度ある飲酒」の上限とする解釈もあるため、
 * ここでは男女共通で週あたりの推奨上限を使用
 */
const WEEKLY_LIMIT = {
    male: 150,   // 約20g/日 × 7日 ≒ 中瓶7本相当
    female: 100  // やや厳しめ
};

/**
 * Weekly Alcohol Meter の描画
 * @param {import('../types.js').Log[]} allLogs - 全期間ログ
 */
export function renderAlcoholMeter(allLogs) {
    const container = document.getElementById('alcohol-meter-card');
    if (!container) return;

    const profile = Store.getProfile();
    const gender = (profile && profile.gender) || 'male';
    const limit = WEEKLY_LIMIT[gender] || WEEKLY_LIMIT.male;

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
            <h3 class="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <i class="ph-duotone ph-heartbeat text-rose-500 text-sm"></i> Weekly Alcohol
            </h3>
            <span class="text-[10px] font-bold ${textColor}">
                ${Math.round(totalAlcohol)}g / ${limit}g
            </span>
        </div>

        <div class="w-full h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-2">
            <div class="${barColor} h-full rounded-full transition-all duration-500 ease-out"
                 style="width: ${pct}%"></div>
        </div>

        <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold text-gray-400">${statusText}</span>
            ${overLimit ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${bgColor} ${textColor}">Over</span>` : ''}
        </div>
    `;
}
