// @ts-check
import { STATS_LAYOUT_DEFAULTS, STATS_LAYOUT_PRESETS } from '../constants.js';
import { StateManager } from './state.js';
import { toggleModal, showMessage } from './dom.js';

let draftLayout = structuredClone(STATS_LAYOUT_DEFAULTS);

const emitStatsLayoutDebug = (source, extra = {}) => {
    try {
        if (typeof window === 'undefined') return;
        if (!window.__statsLayoutDebug) {
            window.__statsLayoutDebug = { openCount: 0, logs: [] };
        }
        window.__statsLayoutDebug.openCount += 1;
        const modalEl = document.getElementById('stats-layout-modal');
        const payload = {
            ts: Date.now(),
            source,
            modalFound: !!modalEl,
            modalHidden: modalEl ? modalEl.classList.contains('hidden') : null,
            ...extra
        };
        window.__statsLayoutDebug.logs.push(payload);
        if (window.__statsLayoutDebug.logs.length > 100) {
            window.__statsLayoutDebug.logs.shift();
        }
        console.warn('[StatsLayoutDebug] open request', payload);
    } catch (e) {
        console.warn('[StatsLayoutDebug] debug emit failed', e);
    }
};

const mergeLayout = (input = null) => ({
    ...structuredClone(STATS_LAYOUT_DEFAULTS),
    ...(input || {}),
    beer: {
        ...STATS_LAYOUT_DEFAULTS.beer,
        ...((input && input.beer) || {}),
    },
    activity: {
        ...STATS_LAYOUT_DEFAULTS.activity,
        ...((input && input.activity) || {}),
    },
});


const STATS_LAYOUT_ITEMS = {
    beer: [
        { key: 'summaryMetrics', label: 'サマリーメトリクス' },
        { key: 'flavorTrend', label: 'フレーバー推移' },
        { key: 'styleBreakdown', label: 'スタイル内訳' },
        { key: 'abvBands', label: 'ABV帯分布' },
        { key: 'rollingTrend', label: '4週間ローリングトレンド' },
        { key: 'weekdayHeatmap', label: '曜日×時間帯ヒートマップ' },
        { key: 'sessionProfile', label: '1日あたり摂取プロファイル' },
        { key: 'exploreRepeat', label: 'Explore / Repeat バランス' },
        { key: 'periodComparison', label: '期間比較' },
        { key: 'beerInsights', label: 'Beer Insight' },
    ],
    activity: [
        { key: 'activityCalendar', label: '活動カレンダー' },
        { key: 'calorieBalance', label: 'カロリーバランス推移' },
        { key: 'healthInsights', label: 'ヘルスインサイト' },
    ],
};

const ensureBeerLayoutHasOneEnabled = (layout) => {
    const merged = mergeLayout(layout);
    const beerKeys = STATS_LAYOUT_ITEMS.beer.map(item => item.key);
    const hasAnyEnabled = beerKeys.some(key => merged?.beer?.[key] !== false);

    if (!hasAnyEnabled) {
        merged.beer.weekdayHeatmap = true;
        return { layout: merged, adjusted: true };
    }

    return { layout: merged, adjusted: false };
};

const renderStatsLayoutSection = (sectionKey, title) => {
    const items = STATS_LAYOUT_ITEMS[sectionKey] || [];
    const rows = items.map((item, idx) => `
        <label class="flex items-center justify-between py-2 cursor-pointer ${idx > 0 ? 'border-t border-base-200 dark:border-base-700' : ''}">
            <span class="text-sm font-bold text-base-900 dark:text-white">${item.label}</span>
            <input type="checkbox" ${draftLayout?.[sectionKey]?.[item.key] !== false ? 'checked' : ''} data-action="statsLayout:toggleItem" data-args='${JSON.stringify({ section: sectionKey, key: item.key })}' class="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
        </label>
    `).join('');

    return `
        <section class="p-3 rounded-xl border border-base-200 dark:border-base-700 bg-base-50 dark:bg-base-800">
            <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">${title}</h4>
            ${rows}
        </section>
    `;
};

const renderStatsLayoutEditor = () => {
    const panel = document.getElementById('stats-layout-content');
    if (!panel) return;

    panel.innerHTML = `
        <div class="space-y-3">
            ${renderStatsLayoutSection('activity', 'Activity分析カード')}
            ${renderStatsLayoutSection('beer', 'Beer分析カード')}
        </div>
    `;
};

export const primeStatsLayoutModalContent = () => {
    draftLayout = mergeLayout(StateManager.statsLayout);
    renderStatsLayoutEditor();
};

export const openStatsLayoutModal = (source = 'unknown') => {
    emitStatsLayoutDebug(source, { phase: 'before-open' });
    primeStatsLayoutModalContent();
    toggleModal('stats-layout-modal', true);

    setTimeout(() => {
        const modalEl = document.getElementById('stats-layout-modal');
        const contentEl = modalEl?.querySelector('div[class*="transform"]');
        const modalStyle = modalEl ? getComputedStyle(modalEl) : null;
        const contentStyle = contentEl ? getComputedStyle(contentEl) : null;
        emitStatsLayoutDebug(source, {
            phase: 'after-open',
            modalDisplay: modalStyle?.display || null,
            modalOpacity: modalStyle?.opacity || null,
            modalPointerEvents: modalStyle?.pointerEvents || null,
            contentOpacity: contentStyle?.opacity || null,
            contentTransform: contentStyle?.transform || null,
        });
    }, 0);
};

export const applyStatsLayoutPreset = (presetKey) => {
    const preset = STATS_LAYOUT_PRESETS[presetKey];
    if (!preset) return;
    draftLayout = mergeLayout(preset);
    renderStatsLayoutEditor();
};

export const toggleStatsLayoutItem = (args, event) => {
    const section = args?.section;
    const key = args?.key;
    if (!section || !key) return;

    const checked = !!event?.target?.checked;
    draftLayout = mergeLayout(draftLayout);
    if (!draftLayout[section]) draftLayout[section] = {};
    draftLayout[section][key] = checked;

    if (section === 'beer') {
        const guarded = ensureBeerLayoutHasOneEnabled(draftLayout);
        draftLayout = guarded.layout;
        if (guarded.adjusted) {
            renderStatsLayoutEditor();
            showMessage('Beer分析カードは最低1つ表示する必要があります', 'warning');
        }
    }
};

export const saveStatsLayoutSettings = () => {
    const guarded = ensureBeerLayoutHasOneEnabled(draftLayout);
    draftLayout = guarded.layout;
    if (guarded.adjusted) {
        showMessage('Beer分析カードが全てOFFだったため、ヒートマップをONに戻しました', 'warning');
    }

    StateManager.setStatsLayout(draftLayout);
    toggleModal('stats-layout-modal', false);
    showMessage('Stats表示設定を保存しました', 'success');
};
