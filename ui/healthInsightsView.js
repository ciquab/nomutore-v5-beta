// @ts-check
import { Calc } from '../logic.js';
import { StateManager } from './state.js';
import { APP } from '../constants.js';
import { escapeHtml } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// =============================================
// Health Insights
// =============================================

// 週間アルコール上限は Calc.getWeeklyAlcoholLimit(profile) で体重ベースに算出

let insightsChart = null;

/**
 * Health Insights セクションの描画
 * @param {Array} allLogs - 全期間ログ
 * @param {Array} checks - 全期間チェックデータ
 */
export function renderHealthInsights(allLogs, checks) {
    const section = document.getElementById('health-insights-section');
    if (!section) return;

    const now = dayjs();
    const chartRange = StateManager.chartRange || '1m';
    const rangeStart = chartRange === '1w'
        ? now.subtract(7, 'day').startOf('day')
        : chartRange === '1m'
            ? now.subtract(1, 'month').startOf('day')
            : now.subtract(3, 'month').startOf('day');

    const rangeChecks = checks.filter(c => c.timestamp >= rangeStart.valueOf());
    const rangeLogs = allLogs.filter(l => l.timestamp >= rangeStart.valueOf());

    // --- 1. 飲酒日 vs 休肝日 の状態/行動比較 ---
    const drinkingStateScores = [];
    const restStateScores = [];
    const drinkingActionScores = [];
    const restActionScores = [];

    rangeChecks.forEach(c => {
        if (!c.isSaved) return;
        const stateScore = Calc.calcStateScore(c);
        const actionScore = Calc.calcActionScore(c);

        const hasBeer = Calc.hasAlcoholLog(rangeLogs, c.timestamp);
        if (c.isDryDay && !hasBeer) {
            if (stateScore !== null) restStateScores.push(stateScore);
            if (actionScore !== null) restActionScores.push(actionScore);
        } else if (hasBeer) {
            if (stateScore !== null) drinkingStateScores.push(stateScore);
            if (actionScore !== null) drinkingActionScores.push(actionScore);
        }
    });

    const avgDrinkingState = drinkingStateScores.length > 0
        ? Math.round((drinkingStateScores.reduce((a, b) => a + b, 0) / drinkingStateScores.length) * 100) : null;
    const avgRestState = restStateScores.length > 0
        ? Math.round((restStateScores.reduce((a, b) => a + b, 0) / restStateScores.length) * 100) : null;
    const avgDrinkingAction = drinkingActionScores.length > 0
        ? Math.round((drinkingActionScores.reduce((a, b) => a + b, 0) / drinkingActionScores.length) * 100) : null;
    const avgRestAction = restActionScores.length > 0
        ? Math.round((restActionScores.reduce((a, b) => a + b, 0) / restActionScores.length) * 100) : null;
    const hasStateComparison = avgDrinkingState !== null && avgRestState !== null;
    const hasActionComparison = avgDrinkingAction !== null && avgRestAction !== null;
    const hasStateMetricData = drinkingStateScores.length > 0 || restStateScores.length > 0;
    const hasActionMetricData = drinkingActionScores.length > 0 || restActionScores.length > 0;

    // --- 2. 状態/行動推移データ ---
    const chartDays = chartRange === '1w' ? 7 : chartRange === '1m' ? 30 : 90;
    const chartStart = now.subtract(chartDays - 1, 'day').startOf('day');
    const chartLabels = [];
    const alcoholData = [];
    const stateData = [];
    const actionData = [];

    for (let i = 0; i < chartDays; i++) {
        const d = chartStart.add(i, 'day');
        const dateStr = d.format('MM/DD');
        const dayStart = d.startOf('day').valueOf();
        const dayEnd = d.endOf('day').valueOf();

        chartLabels.push(dateStr);

        const dayBeerLogs = rangeLogs.filter(l =>
            l.type === 'beer' && l.timestamp >= dayStart && l.timestamp <= dayEnd
        );
        alcoholData.push(Math.round(Calc.calcTotalPureAlcohol(dayBeerLogs)));

        const dayCheck = rangeChecks.find(c =>
            c.isSaved && c.timestamp >= dayStart && c.timestamp <= dayEnd
        );
        const stateScore = dayCheck ? Calc.calcStateScore(dayCheck) : null;
        const actionScore = dayCheck ? Calc.calcActionScore(dayCheck) : null;
        stateData.push(stateScore !== null ? Math.round(stateScore * 100) : null);
        actionData.push(actionScore !== null ? Math.round(actionScore * 100) : null);
    }

    // --- 3. テキストインサイト ---
    const insights = generateInsightText({
        avgDrinkingState,
        avgRestState,
        avgDrinkingAction,
        avgRestAction,
        stateDrinkDays: drinkingStateScores.length,
        stateRestDays: restStateScores.length,
        actionDrinkDays: drinkingActionScores.length,
        actionRestDays: restActionScores.length
    });

    // --- 4. 体重トレンド (条件付き) ---
    const weightEntries = rangeChecks.filter(c => c.isSaved && c.weight > 0).sort((a, b) => a.timestamp - b.timestamp);
    const hasWeight = weightEntries.length >= 5;

    section.innerHTML = `
        <div class="glass-panel p-5 rounded-2xl relative">
            <div class="flex items-center justify-between gap-3 mb-4">
                <h3 class="text-sm font-bold flex items-center gap-2"><i class="ph-fill ph-heartbeat section-icon text-rose-500" aria-hidden="true"></i> ヘルスインサイト</h3>
                <div id="health-insights-filters" role="group" aria-label="ヘルスインサイト期間フィルター" class="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                    ${['1w', '1m', '3m'].map(range => {
                        const active = range === chartRange;
                        return `<button data-range="${range}" data-action="chart:period" data-args='{"range":"${range}"}' aria-pressed="${active}" class="px-2 py-1 text-[11px] font-bold rounded-md transition-all ${active ? 'bg-white dark:bg-gray-600 text-brand dark:text-indigo-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}">${range.toUpperCase()}</button>`;
                    }).join('')}
                </div>
            </div>

            <div class="mb-5">
                <p class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">比較：飲酒日 vs 休肝日（${chartRange.toUpperCase()}）</p>
                <div class="grid grid-cols-2 gap-3 mb-2 ${hasStateMetricData ? '' : 'opacity-60 grayscale'}">
                    <div class="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl text-center border border-red-100 dark:border-red-800/50">
                        <p class="text-[11px] font-bold text-red-400 uppercase mb-1">状態達成率（飲酒日）</p>
                        <p class="${avgDrinkingState !== null ? 'text-2xl font-black text-red-500 dark:text-red-400' : 'text-sm font-bold text-gray-500 dark:text-gray-400'}">${avgDrinkingState !== null ? `${avgDrinkingState}%` : '対象項目なし'}</p>
                        <p class="text-[11px] text-gray-500 dark:text-gray-400">${drinkingStateScores.length}日</p>
                    </div>
                    <div class="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-xl text-center border border-emerald-100 dark:border-emerald-800/50">
                        <p class="text-[11px] font-bold text-emerald-400 uppercase mb-1">状態達成率（休肝日）</p>
                        <p class="${avgRestState !== null ? 'text-2xl font-black text-emerald-500 dark:text-emerald-400' : 'text-sm font-bold text-gray-500 dark:text-gray-400'}">${avgRestState !== null ? `${avgRestState}%` : '対象項目なし'}</p>
                        <p class="text-[11px] text-gray-500 dark:text-gray-400">${restStateScores.length}日</p>
                    </div>
                </div>
                ${!hasStateMetricData ? '<p class="text-[11px] text-gray-500 font-bold mb-2 text-center">ライブラリで状態項目を1つ追加してください</p>' : ''}
                <div class="grid grid-cols-2 gap-3 ${hasActionMetricData ? '' : 'opacity-60 grayscale'}">
                    <div class="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl text-center border border-amber-100 dark:border-amber-800/50">
                        <p class="text-[11px] font-bold text-amber-500 uppercase mb-1">行動達成率（飲酒日）</p>
                        <p class="${avgDrinkingAction !== null ? 'text-2xl font-black text-amber-500 dark:text-amber-400' : 'text-sm font-bold text-gray-500 dark:text-gray-400'}">${avgDrinkingAction !== null ? `${avgDrinkingAction}%` : '対象項目なし'}</p>
                        <p class="text-[11px] text-gray-500 dark:text-gray-400">${drinkingActionScores.length}日</p>
                    </div>
                    <div class="bg-cyan-50 dark:bg-cyan-900/20 p-3 rounded-xl text-center border border-cyan-100 dark:border-cyan-800/50">
                        <p class="text-[11px] font-bold text-cyan-500 uppercase mb-1">行動達成率（休肝日）</p>
                        <p class="${avgRestAction !== null ? 'text-2xl font-black text-cyan-600 dark:text-cyan-400' : 'text-sm font-bold text-gray-500 dark:text-gray-400'}">${avgRestAction !== null ? `${avgRestAction}%` : '対象項目なし'}</p>
                        <p class="text-[11px] text-gray-500 dark:text-gray-400">${restActionScores.length}日</p>
                    </div>
                </div>
                ${!hasActionMetricData ? '<p class="text-[11px] text-gray-500 font-bold mt-2 text-center">ライブラリで行動項目を1つ追加してください</p>' : ''}
                ${(!hasStateComparison || drinkingStateScores.length < 3 || restStateScores.length < 3) ? '<p class="text-[11px] text-gray-500 dark:text-gray-400 font-bold mt-2 text-center">状態達成率比較は各3日以上で安定します</p>' : ''}
                ${(!hasActionComparison || drinkingActionScores.length < 3 || restActionScores.length < 3) ? '<p class="text-[11px] text-gray-500 dark:text-gray-400 font-bold mt-1 text-center">行動達成率比較は各3日以上で安定します</p>' : ''}
            </div>

            <div class="mb-4">
                <p class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">状態/行動の達成率推移（${chartRange.toUpperCase()}）</p>
                <div class="h-56 w-full relative">
                    <canvas id="healthInsightsChart"></canvas>
                </div>
            </div>

            ${(insights.stateText || insights.actionText) ? `
            <div class="space-y-2">
                ${insights.stateText ? `
                <div class="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                    <p class="text-[11px] font-bold text-brand dark:text-brand-light flex items-start gap-1.5">
                        <i class="ph-duotone ph-heart text-sm flex-shrink-0 mt-0.5" aria-hidden="true"></i>
                        <span><span class="mr-1">状態:</span>${insights.stateText}</span>
                    </p>
                </div>
                ` : ''}
                ${insights.actionText ? `
                <div class="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                    <p class="text-[11px] font-bold text-brand dark:text-brand-light flex items-center gap-1.5">
                        <i class="ph-duotone ph-check-circle text-sm flex-shrink-0" aria-hidden="true"></i>
                        <span><span class="mr-1">行動:</span>${insights.actionText}</span>
                    </p>
                </div>
                ` : ''}
            </div>
            ` : ''}

            ${hasWeight ? `
            <div class="mt-4">
                <p class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">体重推移（${chartRange.toUpperCase()}）</p>
                <div class="h-32 w-full relative">
                    <canvas id="weightTrendChart"></canvas>
                </div>
            </div>
            ` : ''}
        </div>
    `;

    renderHealthChart(chartLabels, alcoholData, stateData, actionData);

    if (hasWeight) {
        renderWeightChart(weightEntries);
    }
}

/**
 * コンディション推移チャートの描画
 */
function renderHealthChart(labels, alcoholData, stateData, actionData) {
    const ctx = document.getElementById('healthInsightsChart');
    if (!ctx) return;
    if (insightsChart) insightsChart.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#9CA3AF' : '#6B7280';

    insightsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'line',
                    label: '状態達成率 %',
                    data: stateData,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#6366f1',
                    tension: 0.3,
                    yAxisID: 'y1',
                    spanGaps: true,
                    fill: true
                },
                {
                    type: 'line',
                    label: '行動達成率 %',
                    data: actionData,
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.08)',
                    borderWidth: 2,
                    pointRadius: 2,
                    pointBackgroundColor: '#06b6d4',
                    tension: 0.3,
                    yAxisID: 'y1',
                    spanGaps: true,
                    fill: false
                },
                {
                    type: 'bar',
                    label: 'アルコール (g)',
                    data: alcoholData,
                    backgroundColor: 'rgba(239, 68, 68, 0.3)',
                    borderColor: 'rgba(239, 68, 68, 0.6)',
                    borderWidth: 1,
                    borderRadius: 4,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: textColor, boxWidth: 10, padding: 12, font: { size: 9, weight: 'bold' } }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    bodyFont: { size: 11, weight: 'bold' },
                    padding: 8,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === 'y1') return `${ctx.dataset.label?.replace(' %', '')}: ${ctx.raw ?? '-'}%`;
                            return `アルコール: ${ctx.raw}g`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: textColor, font: { size: 9, weight: 'bold' }, maxRotation: 45 },
                    grid: { display: false }
                },
                y: {
                    position: 'right',
                    title: { display: false },
                    ticks: { color: textColor, font: { size: 9 }, callback: v => `${v}g` },
                    grid: { color: isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(0,0,0,0.05)' },
                    min: 0
                },
                y1: {
                    position: 'left',
                    title: { display: false },
                    ticks: { color: '#6366F1', font: { size: 9, weight: 'bold' }, callback: v => `${v}%` },
                    grid: { display: false },
                    min: 0,
                    max: 100
                }
            }
        }
    });
}

/**
 * 体重トレンドチャートの描画 (条件付き)
 */
let weightChart = null;

function renderWeightChart(weightEntries) {
    const ctx = document.getElementById('weightTrendChart');
    if (!ctx) return;
    if (weightChart) weightChart.destroy();

    const labels = weightEntries.map(c => dayjs(c.timestamp).format('MM/DD'));
    const data = weightEntries.map(c => c.weight);

    weightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '体重 (kg)',
                data,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: '#8b5cf6',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    bodyFont: { size: 11, weight: 'bold' },
                    padding: 8,
                    cornerRadius: 8
                }
            },
            scales: {
                x: { ticks: { font: { size: 9, weight: 'bold' }, maxRotation: 45 }, grid: { display: false } },
                y: {
                    ticks: { font: { size: 9 }, callback: v => `${v}kg` },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            }
        }
    });
}

/**
 * テキストインサイトの生成
 */
function generateInsightText({
    avgDrinkingState,
    avgRestState,
    avgDrinkingAction,
    avgRestAction,
    stateDrinkDays,
    stateRestDays,
    actionDrinkDays,
    actionRestDays
}) {
    const stateParts = [];
    const actionParts = [];

    if (avgDrinkingState !== null && avgRestState !== null) {
        const diff = avgRestState - avgDrinkingState;
        if (diff >= 10) {
            stateParts.push(`状態達成率は休肝日のほうが ${diff}% 高い傾向です。`);
        } else if (diff <= -10) {
            stateParts.push(`状態達成率は飲酒日のほうが ${Math.abs(diff)}% 高い結果です。チェック項目の内容も見直してみましょう。`);
        }
    }

    if (stateDrinkDays > 0 && stateRestDays === 0) {
        stateParts.push('休肝日の状態データがまだ不足しています。比較精度を上げるには休肝日の記録がおすすめです。');
    }

    if (avgDrinkingAction !== null && avgRestAction !== null) {
        const actionDiff = avgDrinkingAction - avgRestAction;
        if (actionDiff >= 10) {
            actionParts.push(`行動達成率は飲酒日のほうが ${actionDiff}% 高い傾向です。休肝日にもセルフケア行動を残すと比較が安定します。`);
        } else if (actionDiff <= -10) {
            actionParts.push(`行動達成率は休肝日のほうが ${Math.abs(actionDiff)}% 高い傾向です。飲酒日のセルフケア強化余地があります。`);
        }
    }

    if (actionDrinkDays > 0 && actionRestDays === 0) {
        actionParts.push('休肝日の行動データがまだ不足しています。');
    }

    return {
        stateText: stateParts.join(' '),
        actionText: actionParts.join(' ')
    };
}


/**
 * HEXカラーを少し暗くする
 * @param {string} hex
 * @param {number} ratio
 * @returns {string}
 */
function darkenHex(hex, ratio = 0.25) {
    const safeHex = (hex || '#cbd5e1').replace('#', '');
    const v = safeHex.length === 3
        ? safeHex.split('').map(c => c + c).join('')
        : safeHex;

    const n = parseInt(v, 16);
    const r = Math.max(0, Math.floor(((n >> 16) & 255) * (1 - ratio)));
    const g = Math.max(0, Math.floor(((n >> 8) & 255) * (1 - ratio)));
    const b = Math.max(0, Math.floor((n & 255) * (1 - ratio)));

    return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * ドーナツチャートの描画 (Chart.js)
 */
