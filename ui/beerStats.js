// @ts-check
import { Calc } from '../logic.js';
import { escapeHtml } from './dom.js';
import { APP, FLAVOR_AXES, FLAVOR_SCALE_MAX, STYLE_METADATA } from '../constants.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';
import { StateManager } from './state.js';
import { setBeerStatsContext } from './beerStatsShared.js';

let statsChart = null;
let flavorTrendChart = null;
let rollingTrendChart = null;

/**
 * ビール統計画面の描画
 * @param {Array} periodLogs - 現在の期間（今週/今月）のログ
 * @param {Array} allLogs - DBにある全てのメインログ
 * @param {Array} [checks] - 全てのチェックデータ（Health Insights用）
 */
export function renderBeerStats(periodLogs, allLogs, checks) {
    const container = document.getElementById('view-stats-beer');
    if (!container) return;

    // 1. 集計計算
    const allStats = Calc.getBeerStats(allLogs);       // 全期間用
    const periodMode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || APP.DEFAULTS.PERIOD_MODE;
    const isPermanent = periodMode === 'permanent';
    const chartRange = StateManager.chartRange || '1m';
    const focusDays = chartRange === '1w' ? 7 : chartRange === '3m' ? 90 : 30;

    const scopedLogs = isPermanent
        ? (allLogs || []).filter(l => l.timestamp >= dayjs().subtract(focusDays, 'day').startOf('day').valueOf())
        : periodLogs;

    const focusStats = Calc.getBeerStats(scopedLogs);
    const allBeers = allStats.beerStats || []; // 全期間の銘柄リスト
    const focusBeerLogs = (scopedLogs || []).filter(l => l.type === 'beer');
    const periodRange = deriveBeerPeriodRange(scopedLogs);
    const firstTryBeers = calcFirstTryBeerCount(focusBeerLogs, allLogs, periodRange.startTs);
    const previousBeerLogs = getPreviousPeriodBeerLogs(allLogs, periodRange);
    const focusAlcohol = Math.round(Calc.calcTotalPureAlcohol(focusBeerLogs));
    const previousStats = Calc.getBeerStats(previousBeerLogs);
    const previousAlcohol = Math.round(Calc.calcTotalPureAlcohol(previousBeerLogs));
    const avgAbvCurrent = calcAverageAbv(focusBeerLogs);
    const avgAbvPrevious = calcAverageAbv(previousBeerLogs);

    const contextLabel = isPermanent ? `直近${focusDays}日` : '現在期間';
    const comparisonLabel = isPermanent ? `直近${focusDays}日 vs その前` : '直前期間比';
    const modeScopeLabel = isPermanent ? `全体基準: 直近${focusDays}日（${chartRange.toUpperCase()}）` : '全体基準: 期間モード';

    const abvBands = buildAbvBands(focusBeerLogs);
    const heatmap = buildWeekdayTimeHeatmap(focusBeerLogs);
    const perSessionProfile = buildPerSessionProfile(focusBeerLogs);
    const explorationBalance = buildExplorationBalance(focusBeerLogs);
    const flavorTrend = buildFlavorTrendData(allLogs, periodRange.endTs);
    const rollingTrend = buildRollingBeerTrend(allLogs, periodRange.endTs);
    const beerInsights = generateBeerInsights({
        focusStats,
        previousStats,
        focusAlcohol,
        previousAlcohol,
        avgAbvCurrent,
        avgAbvPrevious,
        abvBands,
        explorationBalance,
        contextLabel
    });

    const statsLayout = StateManager.statsLayout || APP.DEFAULTS.STATS_LAYOUT || { beer: {} };
    const beerLayout = {
        summaryMetrics: statsLayout?.beer?.summaryMetrics !== false,
        flavorTrend: statsLayout?.beer?.flavorTrend !== false,
        styleBreakdown: statsLayout?.beer?.styleBreakdown !== false,
        abvBands: statsLayout?.beer?.abvBands !== false,
        rollingTrend: statsLayout?.beer?.rollingTrend !== false,
        weekdayHeatmap: statsLayout?.beer?.weekdayHeatmap !== false,
        sessionProfile: statsLayout?.beer?.sessionProfile !== false,
        exploreRepeat: statsLayout?.beer?.exploreRepeat !== false,
        periodComparison: statsLayout?.beer?.periodComparison !== false,
        beerInsights: statsLayout?.beer?.beerInsights !== false,
    };
    const hasAnyBeerCardEnabled = Object.values(beerLayout).some(Boolean);

    // 共有コンテキスト更新（詳細表示・コレクション共通）
    setBeerStatsContext(allLogs, allBeers, allStats.breweryStats || []);

    // 2. HTML構造生成
    // セクションアイコン配色ルール: 味覚/傾向=暖色, 分析チャート=寒色, 解釈/比較=青系で統一
    container.innerHTML = `
        <div class="space-y-4 pb-24">
            <div class="px-1">
                <span class="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[11px] font-bold px-3 py-1">
                    <i class="ph-fill ph-funnel-simple text-[11px]" aria-hidden="true"></i>${modeScopeLabel}
                </span>
            </div>

            ${beerLayout.summaryMetrics ? `
            <div class="grid grid-cols-3 gap-2 text-center">
                <div class="bg-amber-50 dark:bg-amber-900/20 p-2.5 rounded-2xl border border-amber-100 dark:border-amber-800/50">
                    <p class="text-[10px] font-bold text-amber-800 dark:text-amber-200 uppercase">${isPermanent ? '直近杯数' : '期間合計'}</p>
                    <p class="text-xl font-black text-amber-600 dark:text-amber-400">${focusStats.totalCount}<span class="text-xs ml-1">杯</span></p>
                </div>
                <div class="bg-indigo-50 dark:bg-indigo-900/20 p-2.5 rounded-2xl border border-indigo-100 dark:border-indigo-800/50">
                    <p class="text-[10px] font-bold text-indigo-800 dark:text-indigo-200 uppercase">${isPermanent ? '直近容量' : '期間容量'}</p>
                    <p class="text-xl font-black text-brand dark:text-brand-light">${(focusStats.totalMl / 1000).toFixed(1)}<span class="text-xs ml-1">L</span></p>
                </div>
                <div class="bg-emerald-50 dark:bg-emerald-900/20 p-2.5 rounded-2xl border border-emerald-100 dark:border-emerald-800/50">
                    <p class="text-[10px] font-bold text-emerald-800 dark:text-emerald-200 uppercase">新規銘柄</p>
                    <p class="text-xl font-black text-emerald-600 dark:text-emerald-400">${firstTryBeers}<span class="text-xs ml-1">種</span></p>
                </div>
            </div>
            ` : ''}

            ${beerLayout.flavorTrend ? `
            <div class="glass-panel p-4 rounded-2xl">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="text-sm font-bold flex items-center gap-2"><i class="ph-fill ph-wine section-icon text-rose-500" aria-hidden="true"></i> フレーバー推移</h3>
                    <span class="text-[11px] font-semibold text-gray-500 dark:text-gray-400">${escapeHtml(flavorTrend.caption)}</span>
                </div>
                ${flavorTrend.hasData ? `
                    <div class="h-52 w-full">
                        <canvas id="beerFlavorTrendChart"></canvas>
                    </div>
                    ${flavorTrend.hasComparison ? `
                        <div class="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                            ${flavorTrend.topChanges.map(item => `
                                <div class="rounded-xl border border-fuchsia-100 dark:border-fuchsia-900/40 bg-fuchsia-50/60 dark:bg-fuchsia-900/20 p-2">
                                    <p class="font-semibold text-gray-500 dark:text-gray-400">${escapeHtml(item.label)}</p>
                                    <p class="font-black ${item.delta >= 0 ? 'text-fuchsia-600 dark:text-fuchsia-300' : 'text-emerald-600 dark:text-emerald-300'}">${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}</p>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <p class="mt-2 text-[11px] text-gray-500 dark:text-gray-400 font-semibold">比較データは蓄積中です。味わい傾向の現在値を表示しています。</p>
                    `}
                ` : `
                    <div class="empty-state flex flex-col items-center justify-center py-6 text-gray-500 dark:text-gray-400">
                        <i class="ph-duotone ph-beer-bottle text-3xl mb-2" aria-hidden="true"></i>
                        <p class="text-sm font-bold">フレーバーデータが不足しています</p>
                        <p class="text-xs opacity-60">味わい付きの記録を追加すると推移が表示されます</p>
                    </div>
                `}
                <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-2">${escapeHtml(flavorTrend.note)}</p>
            </div>
            ` : ''}

            ${beerLayout.styleBreakdown ? `
            <div class="glass-panel p-4 rounded-2xl relative">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold flex items-center gap-2"><i class="ph-fill ph-chart-pie section-icon text-indigo-500" aria-hidden="true"></i> スタイル内訳</h3>
                    <span class="text-[11px] font-semibold text-gray-500 dark:text-gray-400">基準: この期間</span>
                </div>
                <div class="h-44 w-full relative">
                    <canvas id="beerStyleChart"></canvas>
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <i class="ph-duotone ph-beer-bottle text-4xl text-base-900 dark:text-white opacity-10" aria-hidden="true"></i>
                        <p id="style-chart-total-label" class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mt-1">スタイル数</p>
                        <p id="style-chart-total-value" class="text-lg font-black text-brand dark:text-brand-light leading-none">0</p>
                    </div>
                </div>
                <div id="style-breakdown-list" class="mt-3 space-y-1.5"></div>
            </div>
            ` : ''}

            ${beerLayout.abvBands ? `
            <div class="glass-panel p-4 rounded-2xl">
                <h3 class="text-sm font-bold flex items-center gap-2 mb-2"><i class="ph-fill ph-gauge section-icon text-amber-500" aria-hidden="true"></i> ABV帯分布</h3>
                <p class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">基準: この期間</p>
                <div class="space-y-2">
                    ${abvBands.map(band => {
                        const pct = focusStats.totalCount > 0 ? Math.round((band.count / focusStats.totalCount) * 100) : 0;
                        const width = pct > 0 ? Math.max(pct, 6) : 0;
                        return `
                            <div>
                                <div class="flex items-center justify-between text-[11px] mb-1">
                                    <span class="font-bold text-gray-700 dark:text-gray-200">${band.label}</span>
                                    <span class="font-semibold text-gray-500 dark:text-gray-400">${band.count}杯 (${pct}%)</span>
                                </div>
                                <div class="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                    <div class="h-full rounded-full" style="width:${width}%; background:${band.color};"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            ` : ''}

            ${beerLayout.rollingTrend ? `
            <div class="glass-panel p-4 rounded-2xl">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="text-sm font-bold flex items-center gap-2"><i class="ph-fill ph-chart-line section-icon text-cyan-500" aria-hidden="true"></i> 4週間ローリングトレンド</h3>
                    <span class="text-[11px] font-semibold text-gray-500 dark:text-gray-400">固定: 4週間</span>
                </div>
                <div class="h-52 w-full">
                    <canvas id="beerRollingTrendChart"></canvas>
                </div>
                <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-2">※ 短期トレンドの比較のため固定窓で表示</p>
            </div>
            ` : ''}

            ${renderWeekdayHeatmapSection(beerLayout, heatmap)}

            ${beerLayout.sessionProfile ? `
            <div class="glass-panel p-4 rounded-2xl">
                <h3 class="text-sm font-bold flex items-center gap-2 mb-2"><i class="ph-fill ph-chart-line-up section-icon text-emerald-500" aria-hidden="true"></i> 1日あたり摂取プロファイル</h3>
                <p class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">基準: この期間</p>
                <div class="grid grid-cols-3 gap-2 text-[11px]">
                    ${renderSessionMetric('杯数', perSessionProfile.count)}
                    ${renderSessionMetric('容量', perSessionProfile.ml, 'ml')}
                    ${renderSessionMetric('純アルコール', perSessionProfile.alcohol, 'g')}
                </div>
                <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-2">P50 = 中央値 / P90 = 多い日の目安（上位10%）</p>
            </div>
            ` : ''}

            ${renderExploreRepeatSection(beerLayout, explorationBalance)}

            ${renderPeriodComparisonSection(beerLayout, {
                isPermanent,
                comparisonLabel,
                focusStats,
                previousStats,
                focusAlcohol,
                previousAlcohol,
                avgAbvCurrent,
                avgAbvPrevious
            })}

            ${beerLayout.beerInsights ? `
            <div class="glass-panel p-4 rounded-2xl">
                <h3 class="text-sm font-bold flex items-center gap-2 mb-2"><i class="ph-fill ph-lightbulb section-icon text-indigo-500" aria-hidden="true"></i> Beer Insight</h3>
                <div class="space-y-2">
                    ${beerInsights.map(item => `
                        <div class="bg-indigo-50/60 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40 rounded-xl p-2.5">
                            <p class="text-xs font-bold text-base-900 dark:text-white">${escapeHtml(item.title)}</p>
                            <p class="text-[11px] text-gray-600 dark:text-gray-300 mt-1">${escapeHtml(item.detail)}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            ${!hasAnyBeerCardEnabled ? renderBeerLayoutEmptyState() : ''}
        </div>
    `;

    // チャート描画
    renderStyleChart(focusStats.styleCounts);
    renderFlavorTrendChart(flavorTrend);
    renderRollingTrendChart(rollingTrend);
}

function buildBeerIdentity(log) {
    const brewery = (log.brewery || '').trim() || 'Unknown';
    const brand = (log.brand || log.name || '').trim() || 'Unknown Beer';
    return `${brewery}|${brand}`;
}

function calcFirstTryBeerCount(focusBeerLogs, allLogs, startTs) {
    const historicalSet = new Set((allLogs || [])
        .filter(l => l.type === 'beer' && Number.isFinite(l.timestamp) && l.timestamp < startTs)
        .map(buildBeerIdentity));

    const firstTrySet = new Set();
    (focusBeerLogs || []).forEach(l => {
        const key = buildBeerIdentity(l);
        if (!historicalSet.has(key)) firstTrySet.add(key);
    });
    return firstTrySet.size;
}

/**
 * 期間ログからレンジを推定する
 * @param {Array} periodLogs
 * @returns {{ startTs:number, endTs:number, spanDays:number }}
 */
function deriveBeerPeriodRange(periodLogs) {
    const logs = (periodLogs || []).filter(l => l && Number.isFinite(l.timestamp));
    if (logs.length === 0) {
        const fallbackEnd = Date.now();
        return {
            startTs: dayjs(fallbackEnd).subtract(7, 'day').startOf('day').valueOf(),
            endTs: fallbackEnd,
            spanDays: 7
        };
    }

    const timestamps = logs.map(l => l.timestamp);
    const startTs = Math.min(...timestamps);
    const endTs = Math.max(...timestamps);
    const spanDays = Math.max(1, dayjs(endTs).diff(dayjs(startTs), 'day') + 1);
    return { startTs, endTs, spanDays };
}

/**
 * 直前期間のビールログを取得
 * @param {Array} allLogs
 * @param {{startTs:number, endTs:number, spanDays:number}} periodRange
 * @returns {Array}
 */
function getPreviousPeriodBeerLogs(allLogs, periodRange) {
    const { startTs, spanDays } = periodRange;
    const previousEnd = dayjs(startTs).subtract(1, 'day').endOf('day').valueOf();
    const previousStart = dayjs(previousEnd).subtract(spanDays - 1, 'day').startOf('day').valueOf();
    return (allLogs || []).filter(l =>
        l.type === 'beer' &&
        Number.isFinite(l.timestamp) &&
        l.timestamp >= previousStart &&
        l.timestamp <= previousEnd
    );
}

/**
 * 平均ABVを算出
 * @param {Array} beerLogs
 * @returns {number}
 */
function calcAverageAbv(beerLogs) {
    const weighted = (beerLogs || []).filter(l => (l.abv || 0) > 0);
    if (weighted.length === 0) return 0;

    const totalCount = weighted.reduce((sum, l) => sum + (l.count || 1), 0);
    if (totalCount <= 0) return 0;

    const weightedAbv = weighted.reduce((sum, l) => sum + (l.abv * (l.count || 1)), 0);
    return Math.round((weightedAbv / totalCount) * 10) / 10;
}

/**
 * ABV帯分布を算出
 * @param {Array} beerLogs
 */
function buildAbvBands(beerLogs) {
    const bands = [
        { label: '0-4%', min: 0, max: 4, count: 0, color: '#34d399' },
        { label: '4-6%', min: 4, max: 6, count: 0, color: '#38bdf8' },
        { label: '6-8%', min: 6, max: 8, count: 0, color: '#f59e0b' },
        { label: '8%+', min: 8, max: Infinity, count: 0, color: '#f43f5e' }
    ];

    (beerLogs || []).forEach(l => {
        const abv = Number(l.abv || 0);
        const count = l.count || 1;
        const target = bands.find(b => abv >= b.min && abv < b.max) || bands[bands.length - 1];
        target.count += count;
    });

    return bands;
}

function renderComparisonMetric(label, current, previous, unit = '', digits = 0) {
    const safeCurrent = Number.isFinite(current) ? current : 0;
    const safePrevious = Number.isFinite(previous) ? previous : 0;
    const diff = safeCurrent - safePrevious;
    const sign = diff > 0 ? '+' : '';
    const tone = diff > 0
        ? 'text-rose-500 dark:text-rose-400'
        : diff < 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-gray-500 dark:text-gray-400';

    const formatValue = (v) => digits > 0 ? v.toFixed(digits) : String(Math.round(v));

    return `
        <div class="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-base-900 p-2">
            <p class="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">${label}</p>
            <p class="text-xs font-black text-base-900 dark:text-white mt-0.5">${formatValue(safeCurrent)}${unit}</p>
            <p class="text-[11px] font-bold mt-0.5 ${tone}">${sign}${formatValue(diff)}${unit}</p>
        </div>
    `;
}

function generateBeerInsights({ focusStats, previousStats, focusAlcohol, previousAlcohol, avgAbvCurrent, avgAbvPrevious, abvBands, explorationBalance, contextLabel }) {
    const insights = [];
    const countDiff = focusStats.totalCount - previousStats.totalCount;
    insights.push({
        title: '杯数トレンド',
        detail: countDiff === 0
            ? `${contextLabel}は前の区間と同じ杯数ペースです。`
            : `${contextLabel}は前の区間比で${countDiff > 0 ? `${countDiff}杯増加` : `${Math.abs(countDiff)}杯減少`}しています。`
    });

    const alcoholDiff = focusAlcohol - previousAlcohol;
    insights.push({
        title: '純アルコール量',
        detail: alcoholDiff === 0
            ? '純アルコール総量は横ばいです。'
            : `純アルコール量は${alcoholDiff > 0 ? `+${alcoholDiff}g` : `${alcoholDiff}g`}の変化です。`
    });

    const abvDiff = Math.round((avgAbvCurrent - avgAbvPrevious) * 10) / 10;
    const highAbv = abvBands.find(b => b.label === '8%+')?.count || 0;
    const total = focusStats.totalCount || 1;
    const highPct = Math.round((highAbv / total) * 100);
    insights.push({
        title: '強度（ABV）傾向',
        detail: `平均ABVは${avgAbvCurrent.toFixed(1)}%（前区間比${abvDiff >= 0 ? '+' : ''}${abvDiff.toFixed(1)}pt）、8%+は${highPct}%です。`
    });

    insights.push({
        title: '探索バランス',
        detail: `Explore率 ${explorationBalance.exploreRate}% / Repeat率 ${explorationBalance.repeatRate}% です。`
    });

    return insights;
}


function buildWeekdayTimeHeatmap(beerLogs) {
    const weekdays = ['月', '火', '水', '木', '金', '土', '日'];
    const slots = ['昼', '夕方', '夜', '深夜'];
    const values = Array.from({ length: 7 }, () => [0, 0, 0, 0]);

    const getSlot = (hour) => {
        if (hour >= 11 && hour < 17) return 0;
        if (hour >= 17 && hour < 20) return 1;
        if (hour >= 20 || hour < 1) return 2;
        return 3;
    };

    (beerLogs || []).forEach(l => {
        const d = dayjs(l.timestamp);
        const dayIndex = (d.day() + 6) % 7;
        const slotIndex = getSlot(d.hour());
        values[dayIndex][slotIndex] += (l.count || 1);
    });

    const max = Math.max(0, ...values.flat());
    return { weekdays, slots, values, max };
}

function percentile(nums, p) {
    if (!nums.length) return 0;
    const sorted = [...nums].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
    return sorted[idx];
}

function buildPerSessionProfile(beerLogs) {
    const byDay = new Map();
    (beerLogs || []).forEach(l => {
        const key = dayjs(l.timestamp).format('YYYY-MM-DD');
        if (!byDay.has(key)) byDay.set(key, { count: 0, ml: 0, alcohol: 0 });
        const row = byDay.get(key);
        const count = l.count || 1;
        row.count += count;
        row.ml += (l.rawAmount || (l.size * count) || 0);
        row.alcohol += Calc.calcPureAlcohol(l.size || 350, l.abv || 5.0, count);
    });

    const counts = [...byDay.values()].map(v => v.count);
    const mls = [...byDay.values()].map(v => Math.round(v.ml));
    const alcohols = [...byDay.values()].map(v => Math.round(v.alcohol));

    return {
        count: { p50: percentile(counts, 0.5), p90: percentile(counts, 0.9) },
        ml: { p50: percentile(mls, 0.5), p90: percentile(mls, 0.9) },
        alcohol: { p50: percentile(alcohols, 0.5), p90: percentile(alcohols, 0.9) }
    };
}

function buildExplorationBalance(beerLogs) {
    const byDay = new Map();
    (beerLogs || []).forEach(l => {
        const key = dayjs(l.timestamp).format('YYYY-MM-DD');
        if (!byDay.has(key)) byDay.set(key, new Map());
        const style = l.style || 'Unknown';
        const styleMap = byDay.get(key);
        styleMap.set(style, (styleMap.get(style) || 0) + (l.count || 1));
    });

    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const seen = new Set();
    let exploreDays = 0;
    let repeatPairs = 0;
    let prevStyle = '';

    days.forEach(([_, styleMap], idx) => {
        const dominantStyle = [...styleMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
        if (!seen.has(dominantStyle)) {
            exploreDays += 1;
            seen.add(dominantStyle);
        }
        if (idx > 0 && dominantStyle === prevStyle) repeatPairs += 1;
        prevStyle = dominantStyle;
    });

    const dayCount = days.length;
    const pairCount = Math.max(dayCount - 1, 0);
    return {
        exploreRate: dayCount > 0 ? Math.round((exploreDays / dayCount) * 100) : 0,
        repeatRate: pairCount > 0 ? Math.round((repeatPairs / pairCount) * 100) : 0,
        dayCount
    };
}


function renderWeekdayHeatmapSection(beerLayout, heatmap) {
    if (!beerLayout?.weekdayHeatmap) return '';

    const levelClass = (value, max) => {
        if (!max || value <= 0) return 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500';
        return 'text-white';
    };

    const levelStyle = (value, max) => {
        if (!max || value <= 0) return '';
        const ratio = value / max;
        if (ratio >= 0.75) return 'background-color:#4f46e5;color:#ffffff;';
        if (ratio >= 0.45) return 'background-color:#818cf8;color:#ffffff;';
        if (ratio >= 0.2) return 'background-color:#c7d2fe;color:#3730a3;';
        return 'background-color:#eef2ff;color:#6366f1;';
    };

    return `
        <div class="glass-panel p-4 rounded-2xl">
            <h3 class="text-sm font-bold flex items-center gap-2 mb-2"><i class="ph-fill ph-calendar-blank section-icon text-cyan-500" aria-hidden="true"></i> 曜日×時間帯ヒートマップ</h3>
            <p class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">基準: この期間</p>
            <div class="grid gap-1 text-[11px]" style="grid-template-columns: minmax(2.25rem, auto) repeat(4, minmax(0, 1fr));">
                <div></div>
                ${heatmap.slots.map(slot => `<div class="text-center text-gray-500 dark:text-gray-400 font-bold py-1">${slot}</div>`).join('')}
                ${heatmap.weekdays.map((day, dayIdx) => {
                    const rowValues = heatmap.values?.[dayIdx] || [];
                    const cells = heatmap.slots.map((_, slotIdx) => {
                        const v = rowValues[slotIdx] || 0;
                        return `<div class="h-8 rounded-md flex items-center justify-center font-bold ${levelClass(v, heatmap.max)}" style="${levelStyle(v, heatmap.max)}">${v > 0 ? v : ''}</div>`;
                    }).join('');
                    return `
                        <div class="text-gray-500 dark:text-gray-400 font-bold py-1">${day}</div>
                        ${cells}
                    `;
                }).join('')}
            </div>
        </div>
    `; // ここでシンプルに閉じる
}

function renderExploreRepeatSection(beerLayout, explorationBalance) {
    if (!beerLayout?.exploreRepeat) return '';
    return `
        <div class="glass-panel p-4 rounded-2xl">
            <h3 class="text-sm font-bold flex items-center gap-2 mb-2"><i class="ph-fill ph-shuffle-angular section-icon text-violet-500" aria-hidden="true"></i> Explore / Repeat バランス</h3>
            <div class="grid grid-cols-2 gap-2">
                <div class="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 p-3">
                    <p class="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Explore率</p>
                    <p class="text-xl font-black text-emerald-600 dark:text-emerald-300">${explorationBalance.exploreRate}%</p>
                </div>
                <div class="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40 p-3">
                    <p class="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">Repeat率</p>
                    <p class="text-xl font-black text-indigo-600 dark:text-indigo-300">${explorationBalance.repeatRate}%</p>
                </div>
            </div>
            <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-2">集計日数: ${explorationBalance.dayCount}日</p>
        </div>
    `;
}

function renderPeriodComparisonSection(beerLayout, { comparisonLabel, focusStats, previousStats, focusAlcohol, previousAlcohol, avgAbvCurrent, avgAbvPrevious }) {
    if (!beerLayout?.periodComparison) return '';
    return `
        <div class="glass-panel p-4 rounded-2xl">
            <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-bold flex items-center gap-2"><i class="ph-fill ph-arrows-left-right section-icon text-blue-500" aria-hidden="true"></i> 期間比較</h3>
                <span class="text-[11px] font-semibold text-gray-500 dark:text-gray-400">${comparisonLabel}</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
                ${renderComparisonMetric('杯数', focusStats.totalCount, previousStats.totalCount, '杯')}
                ${renderComparisonMetric('容量', focusStats.totalMl / 1000, previousStats.totalMl / 1000, 'L', 1)}
                ${renderComparisonMetric('純アルコール', focusAlcohol, previousAlcohol, 'g')}
                ${renderComparisonMetric('平均ABV', avgAbvCurrent, avgAbvPrevious, '%', 1)}
            </div>
        </div>
    `; // ここもシンプルに閉じる
}
function renderBeerLayoutEmptyState() {
    return `
        <div class="empty-state flex flex-col items-center justify-center py-6 text-gray-500 dark:text-gray-400">
            <i class="ph-duotone ph-layout text-3xl mb-2" aria-hidden="true"></i>
            <p class="text-sm font-bold">Beer分析カードがすべて非表示です</p>
            <p class="text-xs opacity-60">表示設定から1つ以上ONにしてください</p>
        </div>
    `;
}

function darkenHex(hex, ratio = 0.25) {
    const h = String(hex || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#94a3b8';
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const r = clamp(parseInt(h.slice(0, 2), 16) * (1 - ratio));
    const g = clamp(parseInt(h.slice(2, 4), 16) * (1 - ratio));
    const b = clamp(parseInt(h.slice(4, 6), 16) * (1 - ratio));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function renderSessionMetric(label, data, unit = '') {
    const suffix = unit ? `${unit}` : '';
    return `
        <div class="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-base-900 p-2.5">
            <p class="min-h-[2.1em] text-gray-500 dark:text-gray-400 font-semibold leading-tight">${label}</p>
            <div class="mt-1 rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                <div class="grid grid-cols-[2.6rem_minmax(0,1fr)] items-center gap-x-1.5 px-2 py-1.5">
                    <span class="text-gray-700 dark:text-gray-300 font-bold">P50</span>
                    <span class="text-base text-base-900 dark:text-white font-bold whitespace-nowrap justify-self-end text-right tabular-nums">${Math.round(data.p50)}${suffix}</span>
                </div>
                <div class="grid grid-cols-[2.6rem_minmax(0,1fr)] items-center gap-x-1.5 px-2 py-1.5">
                    <span class="text-gray-700 dark:text-gray-300 font-bold">P90</span>
                    <span class="text-base text-base-900 dark:text-white font-bold whitespace-nowrap justify-self-end text-right tabular-nums">${Math.round(data.p90)}${suffix}</span>
                </div>
            </div>
        </div>
    `;
}
function calcAvgFlavorByLogs(logs) {
    const target = (logs || []).filter(l => l.type === 'beer' && l.flavorProfile);
    if (target.length === 0) return null;

    const sums = Object.fromEntries(FLAVOR_AXES.map(a => [a.key, 0]));
    const counts = Object.fromEntries(FLAVOR_AXES.map(a => [a.key, 0]));

    target.forEach(l => {
        FLAVOR_AXES.forEach(a => {
            const v = l.flavorProfile?.[a.key];
            if (v !== null && v !== undefined) {
                sums[a.key] += v;
                counts[a.key] += 1;
            }
        });
    });

    const avg = {};
    let has = false;
    FLAVOR_AXES.forEach(a => {
        if (counts[a.key] > 0) {
            avg[a.key] = Math.round((sums[a.key] / counts[a.key]) * 10) / 10;
            has = true;
        } else {
            avg[a.key] = 0;
        }
    });
    return has ? avg : null;
}

function buildFlavorTrendData(allLogs, endTs = Date.now()) {
    const end = dayjs(endTs).endOf('day');

    const recentWindow = 30;
    const baselineWindow = 90;

    const recentStartTs = end.subtract(recentWindow - 1, 'day').startOf('day').valueOf();
    const baselineEndTs = end.subtract(recentWindow, 'day').endOf('day').valueOf();
    const baselineStartTs = dayjs(baselineEndTs).subtract(baselineWindow - 1, 'day').startOf('day').valueOf();

    const flavorLogs = (allLogs || []).filter(l => l.type === 'beer' && l.flavorProfile);
    const recentLogs = flavorLogs.filter(l => l.timestamp >= recentStartTs && l.timestamp <= end.valueOf());
    const baselineLogs = flavorLogs.filter(l => l.timestamp >= baselineStartTs && l.timestamp <= baselineEndTs);

    const recentAvg = calcAvgFlavorByLogs(recentLogs);
    const baselineAvg = calcAvgFlavorByLogs(baselineLogs);

    if (recentAvg && baselineAvg) {
        const topChanges = FLAVOR_AXES.map(a => ({
            key: a.key,
            label: a.label,
            delta: Math.round(((recentAvg[a.key] || 0) - (baselineAvg[a.key] || 0)) * 10) / 10
        }))
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 3);

        return {
            hasData: true,
            hasComparison: true,
            recentAvg,
            baselineAvg,
            topChanges,
            recentLabel: `最近${recentWindow}日`,
            baselineLabel: `過去${baselineWindow}日`,
            caption: `固定: ${recentWindow}日 vs ${baselineWindow}日`,
            note: '※ 嗜好変化の検知を優先するため固定窓で表示'
        };
    }

    const fallbackAvg = recentAvg || calcAvgFlavorByLogs(flavorLogs);
    if (!fallbackAvg) {
        return {
            hasData: false,
            hasComparison: false,
            recentAvg: null,
            baselineAvg: null,
            topChanges: [],
            recentLabel: '',
            baselineLabel: '',
            caption: `固定: ${recentWindow}日 vs ${baselineWindow}日`,
            note: '※ 嗜好変化の検知を優先するため固定窓で表示'
        };
    }

    const historyStartTs = Math.min(...flavorLogs.map(l => l.timestamp));
    const historyDays = Math.max(1, end.diff(dayjs(historyStartTs), 'day') + 1);

    return {
        hasData: true,
        hasComparison: false,
        recentAvg: fallbackAvg,
        baselineAvg: null,
        topChanges: [],
        recentLabel: historyDays < recentWindow ? `記録済み${historyDays}日` : `最近${recentWindow}日`,
        baselineLabel: '',
        caption: historyDays < recentWindow
            ? `記録期間: ${historyDays}日（比較データ準備中）`
            : '比較データ準備中（現在値のみ表示）',
        note: historyDays < recentWindow
            ? `※ 味わい記録の累積日数が${recentWindow}日未満のため、現在値のみ表示`
            : `※ 比較用データ（過去${baselineWindow}日）が不足のため、現在値のみ表示`
    };
}

function buildRollingBeerTrend(allLogs, endTs = Date.now()) {
    const end = dayjs(endTs).endOf('day');
    const labels = [];
    const alcohol = [];
    const avgAbv = [];
    const styleVariety = [];

    for (let i = 3; i >= 0; i--) {
        const rangeEnd = end.subtract(i * 7, 'day');
        const rangeStart = rangeEnd.subtract(6, 'day').startOf('day');
        const bucketLogs = (allLogs || []).filter(l =>
            l.type === 'beer' &&
            l.timestamp >= rangeStart.valueOf() &&
            l.timestamp <= rangeEnd.valueOf()
        );

        labels.push(`${rangeStart.format('M/D')}-${rangeEnd.format('M/D')}`);
        alcohol.push(Math.round(Calc.calcTotalPureAlcohol(bucketLogs)));
        avgAbv.push(calcAverageAbv(bucketLogs));
        styleVariety.push(new Set(bucketLogs.map(l => l.style || 'Unknown')).size);
    }

    return { labels, alcohol, avgAbv, styleVariety };
}

function renderFlavorTrendChart(flavorTrend) {
    const ctx = document.getElementById('beerFlavorTrendChart');
    if (!ctx || !flavorTrend?.hasData) return;
    if (flavorTrendChart) flavorTrendChart.destroy();

    const labels = FLAVOR_AXES.map(a => a.label);
    const recent = FLAVOR_AXES.map(a => flavorTrend.recentAvg[a.key] || 0);
    const datasets = [
        {
            label: flavorTrend.recentLabel || '現在値',
            data: recent,
            backgroundColor: 'rgba(192, 38, 211, 0.18)',
            borderColor: 'rgba(192, 38, 211, 0.85)',
            borderWidth: 2,
            pointRadius: 3
        }
    ];

    if (flavorTrend.hasComparison && flavorTrend.baselineAvg) {
        const baseline = FLAVOR_AXES.map(a => flavorTrend.baselineAvg[a.key] || 0);
        datasets.push({
            label: flavorTrend.baselineLabel || '比較期間',
            data: baseline,
            backgroundColor: 'rgba(14, 165, 233, 0.1)',
            borderColor: 'rgba(14, 165, 233, 0.8)',
            borderWidth: 2,
            pointRadius: 2
        });
    }

    flavorTrendChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
            scales: {
                r: {
                    min: 0,
                    max: FLAVOR_SCALE_MAX,
                    ticks: { stepSize: 1, display: false },
                    pointLabels: { font: { size: 10, weight: 'bold' } }
                }
            }
        }
    });
}

function renderRollingTrendChart(rollingTrend) {
    const ctx = document.getElementById('beerRollingTrendChart');
    if (!ctx) return;
    if (rollingTrendChart) rollingTrendChart.destroy();

    rollingTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: rollingTrend.labels,
            datasets: [
                {
                    label: '純アルコール(g)',
                    data: rollingTrend.alcohol,
                    borderColor: 'rgba(239, 68, 68, 0.9)',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    tension: 0.35,
                    borderWidth: 2,
                    yAxisID: 'y'
                },
                {
                    label: '平均ABV(%)',
                    data: rollingTrend.avgAbv,
                    borderColor: 'rgba(59, 130, 246, 0.9)',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    tension: 0.35,
                    borderWidth: 2,
                    yAxisID: 'y1'
                },
                {
                    label: 'スタイル数',
                    data: rollingTrend.styleVariety,
                    borderColor: 'rgba(16, 185, 129, 0.9)',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    tension: 0.35,
                    borderWidth: 2,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: '純アルコール(g)' }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'ABV / スタイル数' }
                }
            }
        }
    });
}

/**
 * ビールコレクション画面の描画（独立タブ用）
 * @param {Array} periodLogs - 現在の期間のログ
 * @param {Array} allLogs - 全てのログ
 */
function renderStyleChart(styleCounts) {
    const ctx = document.getElementById('beerStyleChart');
    if (!ctx) return;
    if (statsChart) statsChart.destroy();

    const entries = Object.entries(styleCounts || {}).filter(([, count]) => count > 0);
    if (entries.length === 0) return;

    const sortedEntries = entries.sort((a, b) => b[1] - a[1]);
    const labels = sortedEntries.map(([style]) => style);
    const data = sortedEntries.map(([, count]) => count);

    const colorMap = {
        'gold': '#fbbf24', 'amber': '#f59e0b', 'black': '#1f2937',
        'hazy': '#facc15', 'white': '#fcd34d', 'red': '#ef4444',
        'pale': '#fef08a', 'copper': '#d97706', 'green': '#10b981'
    };

    const bgColors = labels.map(style => {
        const meta = STYLE_METADATA[style];
        return colorMap[meta ? meta.color : 'gold'] || '#cbd5e1';
    });

    const borderColors = bgColors.map(c => darkenHex(c, 0.35));

    // 非タップ時でも情報が読めるように補足リストを描画
    const total = data.reduce((a, b) => a + b, 0);
    const totalValueEl = document.getElementById('style-chart-total-value');
    if (totalValueEl) totalValueEl.textContent = String(labels.length);

    const listEl = document.getElementById('style-breakdown-list');
    if (listEl) {
        const topRows = sortedEntries.slice(0, 5).map(([style, count], idx) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const color = bgColors[idx] || '#cbd5e1';
            return `
                <div class="flex items-center justify-between text-[11px]">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="w-2.5 h-2.5 rounded-full border border-black/10" style="background:${color}"></span>
                        <span class="font-bold text-gray-700 dark:text-gray-200 truncate max-w-[150px]">${escapeHtml(style)}</span>
                    </div>
                    <div class="text-gray-500 dark:text-gray-400 font-bold">${count}杯 <span class="text-[11px]">(${pct}%)</span></div>
                </div>
            `;
        }).join('');

        const othersCount = sortedEntries.slice(5).reduce((sum, [, c]) => sum + c, 0);
        const othersHtml = othersCount > 0
            ? `<p class="text-[11px] text-gray-500 dark:text-gray-400 font-bold text-right">その他 ${othersCount}杯</p>`
            : '';

        listEl.innerHTML = topRows + othersHtml;
    }

    statsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    bodyFont: { size: 12, weight: 'bold' },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.raw || 0;
                            const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                            return `${ctx.label}: ${val}杯 (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}


/**
 * 銘柄リストの生成
 */

export { renderBeerCollection } from './beerCollectionView.js';
export { renderHealthInsights } from './healthInsightsView.js';
