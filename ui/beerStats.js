// @ts-check
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { DOM, escapeHtml } from './dom.js';
import { APP, STYLE_METADATA, FLAVOR_AXES, FLAVOR_SCALE_MAX } from '../constants.js';
import { openLogDetail } from './logDetail.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';
import { StateManager } from './state.js';

let statsChart = null;
let flavorTrendChart = null;
let rollingTrendChart = null;

// モジュールスコープでビールデータを保持（ブルワリー詳細表示用）
let _allBeers = [];
let _breweryStats = [];
let _allLogs = [];

// フィルター状態管理
let activeFilters = {
    term: '',
    brewery: '',
    style: '',
    rating: 0
};

const renderRatingStars = (score) => {
    if (!score) return '';
    let starsHtml = '<div class="flex gap-0.5">';
    for (let i = 1; i <= 5; i++) {
        if (i <= score) {
            // 塗りつぶしの星
            starsHtml += '<i class="ph-fill ph-star text-yellow-400 text-[11px]" aria-hidden="true"></i>';
        } else {
            // 空の星（オプション: 表示しないなら省略可）
            starsHtml += '<i class="ph-bold ph-star text-gray-300 dark:text-gray-600 text-[11px]" aria-hidden="true"></i>';
        }
    }
    starsHtml += '</div>';
    return starsHtml;
};

/**
 * ビール統計画面の描画
 * @param {Array} periodLogs - 現在の期間（今週/今月）のログ
 * @param {Array} allLogs - DBにある全てのメインログ
 */
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
    const periodRange = deriveBeerPeriodRange(scopedLogs, allLogs);
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

    // モジュールスコープに保存（ブルワリー詳細表示・Collection用）— 防御コピー
    _allBeers = [...allBeers];
    _breweryStats = [...(allStats.breweryStats || [])];

    // 2. HTML構造生成
    // セクションアイコン配色ルール: 味覚/傾向=暖色, 分析チャート=寒色, 解釈/比較=青系で統一
    container.innerHTML = `
        <div class="space-y-4 pb-24">
            <div class="px-1">
                <span class="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[11px] font-bold px-3 py-1">
                    <i class="ph-fill ph-funnel-simple text-[11px]" aria-hidden="true"></i>${modeScopeLabel}
                </span>
            </div>

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

            <div class="glass-panel p-4 rounded-2xl">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="text-sm font-bold flex items-center gap-2"><i class="ph-fill ph-wine section-icon text-rose-500" aria-hidden="true"></i> フレーバー推移</h3>
                    <span class="text-[11px] font-semibold text-gray-500 dark:text-gray-400">固定: 30日 vs 90日</span>
                </div>
                ${flavorTrend.hasData ? `
                    <div class="h-52 w-full">
                        <canvas id="beerFlavorTrendChart"></canvas>
                    </div>
                    <div class="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                        ${flavorTrend.topChanges.map(item => `
                            <div class="rounded-xl border border-fuchsia-100 dark:border-fuchsia-900/40 bg-fuchsia-50/60 dark:bg-fuchsia-900/20 p-2">
                                <p class="font-semibold text-gray-500 dark:text-gray-400">${escapeHtml(item.label)}</p>
                                <p class="font-black ${item.delta >= 0 ? 'text-fuchsia-600 dark:text-fuchsia-300' : 'text-emerald-600 dark:text-emerald-300'}">${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}</p>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="empty-state flex flex-col items-center justify-center py-6 text-gray-500 dark:text-gray-400">
                        <i class="ph-duotone ph-beer-bottle text-3xl mb-2" aria-hidden="true"></i>
                        <p class="text-sm font-bold">フレーバーデータが不足しています</p>
                        <p class="text-xs opacity-60">味わい付きの記録で比較が表示されます</p>
                    </div>
                `}
                <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-2">※ 嗜好変化の検知を優先するため固定窓で表示</p>
            </div>

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

            <div class="glass-panel p-4 rounded-2xl">
                <h3 class="text-sm font-bold flex items-center gap-2 mb-2"><i class="ph-fill ph-calendar-check section-icon text-sky-500" aria-hidden="true"></i> 曜日×時間帯ヒートマップ</h3>
                <p class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">基準: この期間</p>
                <div class="grid gap-1 text-[10px]" style="grid-template-columns: 24px repeat(4, minmax(0,1fr));">
                    <div></div>
                    ${heatmap.slots.map(slot => `<div class="text-center font-bold text-gray-500 dark:text-gray-400">${slot}</div>`).join('')}
                    ${heatmap.weekdays.map((day, dayIdx) => `
                        <div class="font-bold text-gray-500 dark:text-gray-400 pr-1">${day}</div>
                        ${heatmap.values[dayIdx].map(cell => {
                            const intensity = heatmap.max > 0 ? Math.round((cell / heatmap.max) * 100) : 0;
                            const alpha = Math.max(0.08, intensity / 100);
                            return `<div class="h-6 rounded-md border border-sky-100 dark:border-sky-900/40 flex items-center justify-center font-bold text-[10px]" style="background:rgba(14,165,233,${alpha});">${cell > 0 ? cell : ''}</div>`;
                        }).join('')}
                    `).join('')}
                </div>
            </div>

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

            <div class="glass-panel p-4 rounded-2xl">
                <h3 class="text-sm font-bold flex items-center gap-2 mb-2"><i class="ph-fill ph-compass section-icon text-violet-500" aria-hidden="true"></i> Explore / Repeat バランス</h3>
                <p class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">基準: この期間</p>
                <div class="grid grid-cols-2 gap-2 text-[11px]">
                    <div class="rounded-xl border border-violet-100 dark:border-violet-900/40 bg-violet-50/60 dark:bg-violet-900/20 p-2.5">
                        <p class="font-semibold text-gray-500 dark:text-gray-400">Explore率</p>
                        <p class="text-lg font-black text-violet-600 dark:text-violet-300">${explorationBalance.exploreRate}%</p>
                        <p class="text-[11px] text-gray-500 dark:text-gray-400">新しいスタイル日 / 飲酒日</p>
                    </div>
                    <div class="rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/20 p-2.5">
                        <p class="font-semibold text-gray-500 dark:text-gray-400">Repeat率</p>
                        <p class="text-lg font-black text-amber-600 dark:text-amber-300">${explorationBalance.repeatRate}%</p>
                        <p class="text-[11px] text-gray-500 dark:text-gray-400">同スタイル連続日 / 連続ペア</p>
                    </div>
                </div>
            </div>

            <div class="glass-panel p-4 rounded-2xl">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="text-sm font-bold flex items-center gap-2"><i class="ph-fill ph-arrows-left-right section-icon text-blue-500" aria-hidden="true"></i> ${isPermanent ? '直近比較' : '期間比較'}</h3>
                    <span class="text-[11px] font-semibold text-gray-500 dark:text-gray-400">${comparisonLabel}</span>
                </div>
                <div class="grid grid-cols-2 gap-1.5 text-[11px]">
                    ${renderComparisonMetric('杯数', focusStats.totalCount, previousStats.totalCount, '杯')}
                    ${renderComparisonMetric('容量', Number((focusStats.totalMl / 1000).toFixed(1)), Number((previousStats.totalMl / 1000).toFixed(1)), 'L')}
                    ${renderComparisonMetric('純アルコール', focusAlcohol, previousAlcohol, 'g')}
                    ${renderComparisonMetric('平均ABV', avgAbvCurrent, avgAbvPrevious, '%', 1)}
                </div>
            </div>

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
        </div>
    `;

    // チャート描画
    renderStyleChart(allStats.styleCounts);
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
 * @param {Array} allLogs
 * @returns {{ startTs:number, endTs:number, spanDays:number }}
 */
function deriveBeerPeriodRange(periodLogs, allLogs) {
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
    const end = dayjs(endTs);
    const recentStart = end.subtract(30, 'day').startOf('day').valueOf();
    const baselineStart = end.subtract(120, 'day').startOf('day').valueOf();
    const baselineEnd = end.subtract(31, 'day').endOf('day').valueOf();

    const recentLogs = (allLogs || []).filter(l => l.type === 'beer' && l.timestamp >= recentStart && l.timestamp <= end.valueOf());
    const baselineLogs = (allLogs || []).filter(l => l.type === 'beer' && l.timestamp >= baselineStart && l.timestamp <= baselineEnd);

    const recentAvg = calcAvgFlavorByLogs(recentLogs);
    const baselineAvg = calcAvgFlavorByLogs(baselineLogs);

    if (!recentAvg || !baselineAvg) {
        return { hasData: false, recentAvg: null, baselineAvg: null, topChanges: [] };
    }

    const topChanges = FLAVOR_AXES.map(a => ({
        key: a.key,
        label: a.label,
        delta: Math.round(((recentAvg[a.key] || 0) - (baselineAvg[a.key] || 0)) * 10) / 10
    }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 3);

    return { hasData: true, recentAvg, baselineAvg, topChanges };
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
    const baseline = FLAVOR_AXES.map(a => flavorTrend.baselineAvg[a.key] || 0);

    flavorTrendChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels,
            datasets: [
                {
                    label: '最近30日',
                    data: recent,
                    backgroundColor: 'rgba(192, 38, 211, 0.18)',
                    borderColor: 'rgba(192, 38, 211, 0.85)',
                    borderWidth: 2,
                    pointRadius: 3
                },
                {
                    label: '過去90日',
                    data: baseline,
                    backgroundColor: 'rgba(14, 165, 233, 0.1)',
                    borderColor: 'rgba(14, 165, 233, 0.8)',
                    borderWidth: 2,
                    pointRadius: 2
                }
            ]
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
export function renderBeerCollection(periodLogs, allLogs) {
    const container = document.getElementById('view-cellar-collection');
    if (!container) return;

    _allLogs = [...allLogs];
    const allStats = Calc.getBeerStats(allLogs);
    const allBeers = allStats.beerStats || [];
    _allBeers = [...allBeers];
    _breweryStats = [...(allStats.breweryStats || [])];

    const uniqueBreweries = [...new Set(allBeers.map(b => b.brewery).filter(b => b && b !== 'Unknown'))].sort();
    const uniqueStyles = [...new Set(allBeers.map(b => b.style).filter(s => s && s !== 'Unknown'))].sort();

    container.innerHTML = `
        <div id="beer-collection-section">
            <section class="px-1 mb-3">
                <h3 class="section-title text-sm font-bold text-base-900 dark:text-white">コレクション</h3>
                <p class="section-helper mt-0.5">銘柄・ブルワリーを横断して整理できます</p>
            </section>

            <div id="brewery-leaderboard-section" class="glass-panel p-5 rounded-2xl relative mb-4">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-sm font-bold flex items-center gap-2"><i class="ph-fill ph-trophy section-icon text-amber-500" aria-hidden="true"></i> ブルワリーランキング</h3>
                    <span class="text-[11px] font-semibold text-gray-500 dark:text-gray-400" id="brewery-count-label"></span>
                </div>
                <div id="brewery-axis-tabs" class="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-1 px-1"></div>
                <div id="brewery-ranking-list" class="space-y-2"></div>
            </div>

            <div class="sticky-section-shell py-3 -mx-2 px-2">
                <div class="flex items-center justify-between mb-1 px-1">
                    <h3 class="section-title text-sm font-bold text-base-900 dark:text-white">マイビール</h3>
                    <span class="text-xs font-bold text-gray-500 dark:text-gray-400" id="beer-list-count">${allBeers.length}銘柄</span>
                </div>
                <p class="section-helper px-1 mb-3">検索・フィルターで条件を絞り込めます</p>

                <div class="space-y-2">
                    <div class="relative">
                        <input type="text" id="beer-search-input" placeholder="ブルワリー名や銘柄名で検索" class="w-full bg-white dark:bg-base-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold py-2.5 pl-9 pr-3 focus:ring-2 focus:ring-indigo-500 transition">
                        <i class="ph-bold ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" aria-hidden="true"></i>
                    </div>

                    <div class="grid grid-cols-3 gap-2">
                        <div class="relative">
                            <select id="filter-brewery" class="w-full appearance-none bg-white dark:bg-base-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[11px] font-bold py-2 pl-2 pr-6 truncate focus:outline-none focus:border-indigo-500">
                                <option value="">ブルワリー名</option>
                                ${uniqueBreweries.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('')}
                            </select>
                            <div class="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400 text-xs">▼</div>
                        </div>

                        <div class="relative">
                            <select id="filter-style" class="w-full appearance-none bg-white dark:bg-base-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[11px] font-bold py-2 pl-2 pr-6 truncate focus:outline-none focus:border-indigo-500">
                                <option value="">ビアスタイル</option>
                                ${uniqueStyles.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
                            </select>
                            <div class="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400 text-xs">▼</div>
                        </div>

                        <div class="relative">
                            <select id="filter-rating" class="w-full appearance-none bg-white dark:bg-base-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[11px] font-bold py-2 pl-2 pr-6 truncate focus:outline-none focus:border-indigo-500">
                                <option value="0">評価</option>
                                <option value="5">★ 5 のみ</option>
                                <option value="4">★ 4 以上</option>
                                <option value="3">★ 3 以上</option>
                                <option value="2">★ 2 以上</option>
                            </select>
                            <div class="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400 text-xs">▼</div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="beer-ranking-list" class="space-y-3 mt-4 pb-24"></div>
        </div>
    `;

    // フィルター機能の実装
    const applyFilters = () => {
        const term = activeFilters.term.toLowerCase();

        const filtered = allBeers.filter(b => {
            const matchTerm = !term ||
                (b.name && b.name.toLowerCase().includes(term)) ||
                (b.brewery && b.brewery.toLowerCase().includes(term));

            const matchBrewery = !activeFilters.brewery || b.brewery === activeFilters.brewery;
            const matchStyle = !activeFilters.style || b.style === activeFilters.style;
            const matchRating = !activeFilters.rating || b.averageRating >= activeFilters.rating;

            return matchTerm && matchBrewery && matchStyle && matchRating;
        });

        const countLabel = document.getElementById('beer-list-count');
        if(countLabel) countLabel.textContent = `${filtered.length}銘柄`;

        renderBeerList(filtered);
    };

    const bindFilter = (id, key) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(id === 'beer-search-input' ? 'input' : 'change', (e) => {
                activeFilters[key] = e.target.value;
                if(key === 'rating') activeFilters[key] = parseFloat(e.target.value);
                applyFilters();
            });
        }
    };

    bindFilter('beer-search-input', 'term');
    bindFilter('filter-brewery', 'brewery');
    bindFilter('filter-style', 'style');
    bindFilter('filter-rating', 'rating');

    activeFilters = { term: '', brewery: '', style: '', rating: 0 };
    applyFilters();

    // ブルワリーランキング描画
    renderBreweryLeaderboard(allStats.breweryStats || []);
}

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
function renderBeerList(beers) {
    const listEl = document.getElementById('beer-ranking-list');
    if (!listEl) return;

    if (!beers || beers.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state flex flex-col items-center justify-center py-10 text-gray-500 dark:text-gray-400">
                <i class="ph-duotone ph-beer-bottle text-4xl mb-2" aria-hidden="true"></i>
                <p class="text-sm font-bold">該当するビールがありません</p>
                <p class="text-xs opacity-60">フィルター条件を変更してお試しください</p>
            </div>`;
        return;
    }

    listEl.innerHTML = beers.map((beer, index) => {
        let rankBadge = `<span class="text-gray-500 dark:text-gray-400 font-bold text-xs">#${index + 1}</span>`;
        if (index === 0) rankBadge = `<i class="ph-duotone ph-medal text-2xl text-yellow-500 drop-shadow-sm" aria-hidden="true"></i>`;
        if (index === 1) rankBadge = `<i class="ph-duotone ph-medal text-2xl text-gray-500 dark:text-gray-400 drop-shadow-sm" aria-hidden="true"></i>`;
        if (index === 2) rankBadge = `<i class="ph-duotone ph-medal text-2xl text-amber-700 drop-shadow-sm" aria-hidden="true"></i>`;

        const rating = beer.averageRating > 0 
            ? `<span class="flex items-center text-[11px] text-yellow-500 font-bold bg-yellow-50 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded gap-1"><i class="ph-fill ph-star" aria-hidden="true"></i>${beer.averageRating.toFixed(1)}</span>`
            : '';

        // ★修正: STYLE_METADATAからアイコン定義を取得してレンダリング
        const styleMeta = STYLE_METADATA[beer.style];
        const iconDef = styleMeta ? styleMeta.icon : 'ph-duotone ph-beer-bottle';
        // 黒ビール系ならアイコン色を変えるなどの調整も可能
        const iconColor = (styleMeta && styleMeta.color === 'black') ? 'text-gray-700 dark:text-gray-400' : 'text-amber-500';
        
        // DOM.renderIcon でHTML生成
        const iconHtml = DOM.renderIcon(iconDef, `text-3xl ${iconColor}`);

        return `
            <div class="item-card flex items-center bg-white dark:bg-base-900 p-4 rounded-2xl shadow-sm border border-base-100 dark:border-base-700 cursor-pointer active:scale-[0.98] transition-transform" data-beer-brewery="${escapeHtml(beer.brewery || '')}" data-beer-name="${escapeHtml(beer.name)}">
                <div class="flex-shrink-0 w-8 text-center mr-1">${rankBadge}</div>

                <div class="flex-grow min-w-0">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase truncate tracking-wider">${escapeHtml(beer.brewery || '不明')}</p>
                            <h4 class="text-sm font-black text-base-900 dark:text-white leading-tight">${escapeHtml(beer.name)}</h4>
                        </div>
                        <div class="text-right ml-2 flex-shrink-0">
                            <span class="block text-xl font-black text-brand dark:text-brand-light leading-none">${beer.count}</span>
                            <span class="text-[11px] text-gray-500 dark:text-gray-400 font-bold uppercase">杯</span>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 mt-2">
                        <span class="text-[11px] font-semibold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md truncate max-w-[100px]">${beer.style}</span>
                        ${renderRatingStars(beer.rating)}
                        ${hasFlavorProfile(beer) ? '<span class="text-[11px] text-orange-500 font-bold bg-orange-50 dark:bg-orange-900/30 px-1.5 py-0.5 rounded"><i class="ph-duotone ph-chart-polar text-[11px]" aria-hidden="true"></i></span>' : ''}
                        <span class="ml-auto text-[11px] font-mono text-gray-500 dark:text-gray-400">合計: ${(beer.totalMl/1000).toFixed(1)}L</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // ビールエントリのクリック → 最新ログ詳細を表示
    // ★修正: イベントデリゲーションに変更（確実にクリックを拾う）
    listEl.onclick = (e) => {
        const el = e.target.closest('[data-beer-name]');
        if (!el) return;

        const brewery = el.dataset.beerBrewery || '';
        const name = el.dataset.beerName || '';
        
        // 該当ビールの最新ログを検索
        const matchingLog = _allLogs
            .filter(l => l.type === 'beer' &&
                (l.brewery || '').trim() === brewery &&
                ((l.brand || l.name || '').trim() === name))
            .sort((a, b) => b.timestamp - a.timestamp)[0];
            
        if (matchingLog) {
            openLogDetail(matchingLog);
        }
    };
}

// =============================================
// Brewery Leaderboard
// =============================================
const BREWERY_AXES = [
    { key: 'totalCount',  label: '杯数',     icon: 'ph-duotone ph-beer-bottle', unit: '杯',  format: v => String(v) },
    { key: 'uniqueBeers', label: '種類数',    icon: 'ph-duotone ph-books',       unit: '種',  format: v => String(v) },
    { key: 'averageRating', label: '評価',    icon: 'ph-fill ph-star',           unit: '',    format: v => v.toFixed(2), filterFn: b => b.ratingCount > 0 },
    { key: 'totalMl',     label: '総容量',    icon: 'ph-duotone ph-drop',        unit: 'L',   format: v => (v / 1000).toFixed(1) },
    { key: 'styleCount',  label: 'スタイル幅', icon: 'ph-duotone ph-palette',    unit: '種',  format: v => String(v) },
];

let currentBreweryAxis = 'totalCount';

/**
 * ブルワリーランキングの描画
 * @param {Array} breweryStats - Calc.getBeerStats().breweryStats
 */
function renderBreweryLeaderboard(breweryStats) {
    const tabsEl = document.getElementById('brewery-axis-tabs');
    const listEl = document.getElementById('brewery-ranking-list');
    const countLabel = document.getElementById('brewery-count-label');
    if (!tabsEl || !listEl) return;

    // タブ描画
    tabsEl.innerHTML = BREWERY_AXES.map(axis => {
        const active = axis.key === currentBreweryAxis;
        const base = 'flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer select-none';
        const colors = active
            ? 'bg-brand text-white shadow-sm'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700';
        return `<button class="${base} ${colors}" data-brewery-axis="${axis.key}">
            <i class="${axis.icon} text-xs"></i>${axis.label}
        </button>`;
    }).join('');

    // タブクリックイベント
    tabsEl.querySelectorAll('[data-brewery-axis]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentBreweryAxis = btn.dataset.breweryAxis;
            renderBreweryLeaderboard(breweryStats);
        });
    });

    const axis = BREWERY_AXES.find(a => a.key === currentBreweryAxis);
    if (!axis) return;

    // フィルター＆ソート
    let entries = axis.filterFn ? breweryStats.filter(axis.filterFn) : [...breweryStats];
    entries.sort((a, b) => b[axis.key] - a[axis.key]);

    // 空のブルワリーを除外
    entries = entries.filter(b => b.brewery && b.brewery !== 'Unknown' && b.brewery !== '不明');

    if (countLabel) countLabel.textContent = `${entries.length}件`;

    if (entries.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                <i class="ph-duotone ph-warehouse text-3xl mb-2" aria-hidden="true"></i>
                <p class="text-sm font-bold">ブルワリーデータがまだありません</p>
                <p class="text-xs opacity-60">ビールを記録すると自動で集計されます</p>
            </div>`;
        return;
    }

    // 最大5件表示（展開可能に）
    const TOP_N = 5;
    const showAll = entries.length <= TOP_N + 2; // 残り1-2件なら全部出す
    const visible = showAll ? entries : entries.slice(0, TOP_N);

    const maxVal = entries[0][axis.key] || 1;
    listEl.innerHTML = visible
        .map((b, i) => renderBreweryLeaderboardItem({ brewery: b, rankIndex: i, axis, maxVal }))
        .join('');

    // ブルワリーエントリのクリックイベント
    // ★修正: イベントデリゲーションに変更
    listEl.onclick = (e) => {
        const target = e.target.closest('[data-brewery-name]');
        if (target) {
            // タップ時のフィードバック演出
            target.classList.add('bg-gray-100', 'dark:bg-gray-700'); 
            setTimeout(() => target.classList.remove('bg-gray-100', 'dark:bg-gray-700'), 100);
            
            showBreweryDetail(target.dataset.breweryName);
        }
    };

    // 「もっと見る」ボタン
    if (!showAll && entries.length > TOP_N) {
        const remaining = entries.length - TOP_N;
        listEl.innerHTML += `
            <button id="brewery-show-all" class="w-full text-center py-2 text-[11px] font-bold text-indigo-500 hover:text-indigo-700 transition">
                <i class="ph-bold ph-caret-down mr-1" aria-hidden="true"></i>他 ${remaining} 件を表示
            </button>`;
        const showAllBtn = document.getElementById('brewery-show-all');
        if (showAllBtn) {
            showAllBtn.addEventListener('click', () => {
                // 残り全件を追加
                const extra = entries.slice(TOP_N);
                showAllBtn.remove();
                const fragment = extra
                    .map((b, idx) => renderBreweryLeaderboardItem({ brewery: b, rankIndex: idx + TOP_N, axis, maxVal }))
                    .join('');
                listEl.insertAdjacentHTML('beforeend', fragment);
            });
        }
    }
}

function renderBreweryLeaderboardItem({ brewery, rankIndex, axis, maxVal }) {
    const pct = Math.round((brewery[axis.key] / maxVal) * 100);
    const value = axis.format(brewery[axis.key]);
    const subInfo = buildBrewerySubInfo(brewery, axis.key);
    let rankBadge;

    if (rankIndex === 0) rankBadge = '<i class="ph-duotone ph-crown text-lg text-yellow-500" aria-hidden="true"></i>';
    else if (rankIndex === 1) rankBadge = '<span class="text-xs font-black text-gray-500 dark:text-gray-400">2</span>';
    else if (rankIndex === 2) rankBadge = '<span class="text-xs font-black text-amber-700">3</span>';
    else rankBadge = `<span class="text-xs font-bold text-gray-500 dark:text-gray-400">${rankIndex + 1}</span>`;

    return `
        <div class="item-row rounded-2xl bg-white dark:bg-base-900 border border-base-100 dark:border-base-700 px-3 py-2.5 cursor-pointer active:scale-[0.98] transition-transform" data-brewery-name="${escapeHtml(brewery.brewery)}">
            <div class="flex items-center gap-2.5">
                <div class="flex-shrink-0 w-6 text-center">${rankBadge}</div>
                <div class="flex-grow min-w-0">
                    <div class="flex items-center justify-between gap-2">
                        <p class="text-xs font-black text-base-900 dark:text-white truncate">${escapeHtml(brewery.brewery)}</p>
                        <p class="text-[11px] font-black text-brand dark:text-brand-light whitespace-nowrap">${value}${axis.unit}</p>
                    </div>
                    <p class="text-[11px] text-gray-500 dark:text-gray-400 font-bold truncate mt-0.5">${subInfo}</p>
                    <div class="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-base-800 overflow-hidden" aria-hidden="true">
                        <div class="h-full rounded-full bg-indigo-400 dark:bg-indigo-500" style="width: ${pct}%"></div>
                    </div>
                </div>
                <i class="ph-bold ph-caret-right text-[11px] text-gray-300 dark:text-gray-600 flex-shrink-0" aria-hidden="true"></i>
            </div>
        </div>`;
}

/**
 * ブルワリーのサブ情報を構築 (現在のソート軸以外の情報を表示)
 */
function buildBrewerySubInfo(b, currentKey) {
    const parts = [];
    if (currentKey !== 'uniqueBeers') parts.push(`${b.uniqueBeers}種`);
    if (currentKey !== 'totalCount') parts.push(`${b.totalCount}杯`);
    if (currentKey !== 'averageRating' && b.ratingCount > 0) parts.push(`★${b.averageRating.toFixed(1)}`);
    if (currentKey !== 'totalMl') parts.push(`${(b.totalMl / 1000).toFixed(1)}L`);
    if (currentKey !== 'styleCount') parts.push(`${b.styleCount}スタイル`);
    return parts.slice(0, 3).join(' · ');
}

// =============================================
// Brewery Detail (ブルワリー詳細ボトムシート)
// =============================================

/**
 * ブルワリー詳細をボトムシートで表示
 * @param {string} breweryName - ブルワリー名
 */
function showBreweryDetail(breweryName) {
    console.log('Open Brewery:', breweryName); // デバッグ用ログ

    // 1. オーバーレイの取得・作成
    let overlay = document.getElementById('brewery-detail-overlay');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'brewery-detail-overlay';
        overlay.className = 'fixed inset-0 z-[1100] hidden'; // z-[1100] で最前面へ
        
        overlay.innerHTML = `
            <div class="absolute inset-0 bg-black/50 backdrop-blur-sm opacity-0 transition-opacity duration-300" id="brewery-detail-backdrop"></div>
            <div class="absolute bottom-0 left-0 right-0 max-h-[80vh] bg-white dark:bg-base-900 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col transform transition-transform duration-300 translate-y-full" id="brewery-detail-sheet">
                <div class="sticky top-0 bg-white dark:bg-base-900 z-10 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                    <div class="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-3"></div>
                    <div class="flex items-center justify-between">
                        <h3 id="brewery-detail-title" class="text-lg font-black text-base-900 dark:text-white truncate"></h3>
                        <button id="brewery-detail-close" class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-base-800 text-gray-500">
                            <i class="ph-bold ph-x text-sm" aria-hidden="true"></i>
                        </button>
                    </div>
                    <div id="brewery-detail-meta" class="flex gap-3 mt-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400"></div>
                </div>
                <div id="brewery-detail-list" class="overflow-y-auto px-4 py-3 space-y-2 pb-10"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        // 閉じるイベントの設定
        const closeDetail = () => {
            const sheet = document.getElementById('brewery-detail-sheet');
            const backdrop = document.getElementById('brewery-detail-backdrop');
            
            if (sheet) sheet.style.transform = 'translateY(100%)';
            if (backdrop) backdrop.style.opacity = '0';
            
            setTimeout(() => {
                const ov = document.getElementById('brewery-detail-overlay');
                if(ov) ov.classList.add('hidden');
            }, 300);
        };

        const closeBtn = overlay.querySelector('#brewery-detail-close');
        const backdropEl = overlay.querySelector('#brewery-detail-backdrop');
        
        if(closeBtn) closeBtn.onclick = closeDetail;
        if(backdropEl) backdropEl.onclick = closeDetail;
    }

    // 2. データの検索
    const brewery = _breweryStats.find(b => b.brewery === breweryName);
    const beers = _allBeers.filter(b => b.brewery === breweryName).sort((a, b) => b.count - a.count);

    if (!brewery || beers.length === 0) {
        console.warn('Brewery data not found:', breweryName);
        return;
    }

    // 3. データの流し込み
    const titleEl = document.getElementById('brewery-detail-title');
    if (titleEl) titleEl.textContent = breweryName;

    const metaEl = document.getElementById('brewery-detail-meta');
    if (metaEl) {
        const metaParts = [
            `<span class="bg-indigo-50 dark:bg-indigo-900/30 text-brand dark:text-brand-light px-2 py-0.5 rounded-md">${brewery.totalCount}杯</span>`,
            `<span class="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md">${brewery.uniqueBeers}種</span>`,
            `<span class="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md">${(brewery.totalMl / 1000).toFixed(1)}L</span>`
        ];
        if (brewery.ratingCount > 0) {
            metaParts.push(`<span class="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded-md flex items-center gap-0.5"><i class="ph-fill ph-star text-[11px]" aria-hidden="true"></i>${brewery.averageRating.toFixed(1)}</span>`);
        }
        metaEl.innerHTML = metaParts.join('');
    }

    const listEl = document.getElementById('brewery-detail-list');
    if (listEl) {
        listEl.innerHTML = beers.map((beer, index) => {
            let rankBadge = `<span class="text-gray-500 dark:text-gray-400 font-bold text-xs">#${index + 1}</span>`;
            if (index === 0) rankBadge = `<i class="ph-duotone ph-medal text-xl text-yellow-500" aria-hidden="true"></i>`;
            if (index === 1) rankBadge = `<i class="ph-duotone ph-medal text-xl text-gray-500 dark:text-gray-400" aria-hidden="true"></i>`;
            if (index === 2) rankBadge = `<i class="ph-duotone ph-medal text-xl text-amber-700" aria-hidden="true"></i>`;

            return `
                <div class="flex items-center bg-white dark:bg-base-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-700">
                    <div class="flex-shrink-0 w-7 text-center mr-2">${rankBadge}</div>
                    <div class="flex-grow min-w-0">
                        <h4 class="text-sm font-black text-base-900 dark:text-white truncate leading-tight">${escapeHtml(beer.name)}</h4>
                        <div class="flex items-center gap-2 mt-1.5">
                            <span class="text-[11px] font-semibold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md truncate max-w-[100px]">${escapeHtml(beer.style)}</span>
                            ${renderRatingStars(beer.averageRating)}
                        </div>
                    </div>
                    <div class="flex-shrink-0 text-right ml-2">
                        <span class="block text-lg font-black text-brand dark:text-brand-light leading-none">${beer.count}</span>
                        <span class="text-[11px] text-gray-500 dark:text-gray-400 font-bold">${(beer.totalMl / 1000).toFixed(1)}L</span>
                    </div>
                </div>`;
        }).join('');
    }

    // 4. 表示アニメーション (修正版)
    overlay.classList.remove('hidden');
    
    // ★重要: ブラウザに「hiddenが外れた」ことを認識させるための強制リフロー
    void overlay.offsetWidth; 

    // 少し待ってからスタイルを適用（setTimeoutの方がrAFより確実な場合があります）
    setTimeout(() => {
        const sheet = document.getElementById('brewery-detail-sheet');
        const backdrop = document.getElementById('brewery-detail-backdrop');
        if (sheet) sheet.style.transform = 'translateY(0)';
        if (backdrop) backdrop.style.opacity = '1';
    }, 10);

    // ブルワリー平均レーダーチャートの描画
    requestAnimationFrame(() => {
        const avgProfile = calcBreweryAvgFlavor(breweryName);
        if (avgProfile) {
            renderBreweryFlavorRadar(avgProfile);
        }
    });
}

// =============================================
// Flavor Profile Helpers
// =============================================

/**
 * ビールに味わいプロファイルがあるか判定
 * _allLogs から該当ビールの最新ログを探して判定
 */
function hasFlavorProfile(beer) {
    const log = _allLogs.find(l =>
        l.type === 'beer' &&
        (l.brewery || '').trim() === (beer.brewery || '') &&
        (l.brand || l.name || '').trim() === beer.name &&
        l.flavorProfile
    );
    return !!log;
}

/**
 * ブルワリーの味わい平均を計算
 * @param {string} breweryName
 * @returns {Record<string, number>|null}
 */
function calcBreweryAvgFlavor(breweryName) {
    const logs = _allLogs.filter(l =>
        l.type === 'beer' &&
        (l.brewery || '').trim() === breweryName &&
        l.flavorProfile
    );
    if (logs.length === 0) return null;

    const sums = {};
    const counts = {};

    FLAVOR_AXES.forEach(a => {
        sums[a.key] = 0;
        counts[a.key] = 0;
    });

    logs.forEach(l => {
        const fp = l.flavorProfile;
        FLAVOR_AXES.forEach(a => {
            if (fp[a.key] !== null && fp[a.key] !== undefined) {
                sums[a.key] += fp[a.key];
                counts[a.key]++;
            }
        });
    });

    const result = {};
    let hasData = false;
    FLAVOR_AXES.forEach(a => {
        if (counts[a.key] > 0) {
            result[a.key] = Math.round((sums[a.key] / counts[a.key]) * 10) / 10;
            hasData = true;
        } else {
            result[a.key] = 0;
        }
    });

    return hasData ? result : null;
}

/**
 * ブルワリー詳細ボトムシートにレーダーチャートを描画
 */
let breweryRadarChart = null;

function renderBreweryFlavorRadar(avgProfile) {
    // キャンバス要素を探す or 作成
    const listEl = document.getElementById('brewery-detail-list');
    if (!listEl) return;

    // 既存のレーダーコンテナを探す
    let container = document.getElementById('brewery-flavor-radar-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'brewery-flavor-radar-container';
        container.className = 'bg-white dark:bg-base-900 p-4 rounded-2xl border border-orange-100 dark:border-orange-900/30 mb-3';
        container.innerHTML = `
            <span class="text-[11px] font-semibold text-gray-500 uppercase mb-2 block">味わい傾向（平均）</span>
            <div class="h-44 w-full relative">
                <canvas id="brewery-flavor-radar"></canvas>
            </div>
        `;
        listEl.insertBefore(container, listEl.firstChild);
    }

    const ctx = document.getElementById('brewery-flavor-radar');
    if (!ctx) return;

    if (breweryRadarChart) breweryRadarChart.destroy();

    const labels = FLAVOR_AXES.map(a => a.label);
    const data = FLAVOR_AXES.map(a => avgProfile[a.key] ?? 0);

    breweryRadarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels,
            datasets: [{
                label: '平均',
                data,
                backgroundColor: 'rgba(249, 115, 22, 0.15)',
                borderColor: 'rgba(249, 115, 22, 0.8)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(249, 115, 22, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 1,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                r: {
                    min: 0,
                    max: FLAVOR_SCALE_MAX,
                    ticks: { stepSize: 1, display: false },
                    grid: { color: 'rgba(0, 0, 0, 0.08)' },
                    angleLines: { color: 'rgba(0, 0, 0, 0.08)' },
                    pointLabels: {
                        font: { size: 11, weight: 'bold' },
                        color: '#6b7280'
                    }
                }
            }
        }
    });
}
