// @ts-check
import { STATS_LAYOUT_DEFAULTS, STATS_LAYOUT_PRESETS } from '../constants.js';
import { StateManager } from './state.js';
import { toggleModal, showMessage } from './dom.js';

let draftLayout = structuredClone(STATS_LAYOUT_DEFAULTS);

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

const renderStatsLayoutEditor = () => {
    const panel = document.getElementById('stats-layout-content');
    if (!panel) return;

    panel.innerHTML = `
        <div class="space-y-3">
            <section class="p-3 rounded-xl border border-base-200 dark:border-base-700 bg-base-50 dark:bg-base-800">
                <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Beer分析カード</h4>
                <label class="flex items-center justify-between py-2 cursor-pointer">
                    <span class="text-sm font-bold text-base-900 dark:text-white">曜日×時間帯ヒートマップ</span>
                    <input type="checkbox" ${draftLayout.beer.weekdayHeatmap ? 'checked' : ''} data-action="statsLayout:toggleItem" data-args='{"section":"beer","key":"weekdayHeatmap"}' class="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                </label>
                <label class="flex items-center justify-between py-2 cursor-pointer border-t border-base-200 dark:border-base-700">
                    <span class="text-sm font-bold text-base-900 dark:text-white">Explore / Repeat バランス</span>
                    <input type="checkbox" ${draftLayout.beer.exploreRepeat ? 'checked' : ''} data-action="statsLayout:toggleItem" data-args='{"section":"beer","key":"exploreRepeat"}' class="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                </label>
                <label class="flex items-center justify-between py-2 cursor-pointer border-t border-base-200 dark:border-base-700">
                    <span class="text-sm font-bold text-base-900 dark:text-white">期間比較</span>
                    <input type="checkbox" ${draftLayout.beer.periodComparison ? 'checked' : ''} data-action="statsLayout:toggleItem" data-args='{"section":"beer","key":"periodComparison"}' class="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                </label>
            </section>
            <section class="p-3 rounded-xl border border-base-200 dark:border-base-700 bg-base-50 dark:bg-base-800">
                <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Activity分析カード</h4>
                <label class="flex items-center justify-between py-2 cursor-pointer">
                    <span class="text-sm font-bold text-base-900 dark:text-white">ヘルスインサイト</span>
                    <input type="checkbox" ${draftLayout.activity.healthInsights ? 'checked' : ''} data-action="statsLayout:toggleItem" data-args='{"section":"activity","key":"healthInsights"}' class="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                </label>
            </section>
        </div>
    `;
};

export const openStatsLayoutModal = () => {
    draftLayout = mergeLayout(StateManager.statsLayout);
    renderStatsLayoutEditor();
    toggleModal('stats-layout-modal', true);
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
};

export const saveStatsLayoutSettings = () => {
    StateManager.setStatsLayout(draftLayout);
    toggleModal('stats-layout-modal', false);
    showMessage('Stats表示設定を保存しました', 'success');
};
