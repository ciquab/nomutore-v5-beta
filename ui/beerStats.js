// @ts-check
import { Calc } from '../logic.js';
import { DOM, escapeHtml } from './dom.js';
import { STYLE_METADATA } from '../constants.js';
import { openLogDetail } from './logDetail.js';

let statsChart = null;

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
            starsHtml += '<i class="ph-fill ph-star text-yellow-400 text-[10px]"></i>';
        } else {
            // 空の星（オプション: 表示しないなら省略可）
            starsHtml += '<i class="ph-regular ph-star text-gray-300 dark:text-gray-600 text-[10px]"></i>';
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
export function renderBeerStats(periodLogs, allLogs) {
    const container = document.getElementById('view-cellar-stats');
    if (!container) return;

    // 1. 集計計算
    const periodStats = Calc.getBeerStats(periodLogs); // 現在の期間用
    const allStats = Calc.getBeerStats(allLogs);       // 全期間用
    
    const allBeers = allStats.beerStats || []; // 全期間の銘柄リスト

    // モジュールスコープに保存（ブルワリー詳細表示・Collection用）
    _allBeers = allBeers;
    _breweryStats = allStats.breweryStats || [];

    // 2. HTML構造生成
    container.innerHTML = `
        <div class="space-y-6 pb-24">
            <div class="grid grid-cols-3 gap-3 text-center">
                <div class="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-2xl border border-amber-100 dark:border-amber-800/50">
                    <p class="text-[10px] font-bold text-amber-800 dark:text-amber-200 uppercase">Period Total</p>
                    <p class="text-xl font-black text-amber-600 dark:text-amber-400">${periodStats.totalCount}<span class="text-xs ml-1">杯</span></p>
                </div>
                <div class="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-2xl border border-indigo-100 dark:border-indigo-800/50">
                    <p class="text-[10px] font-bold text-indigo-800 dark:text-indigo-200 uppercase">Period Vol.</p>
                    <p class="text-xl font-black text-indigo-600 dark:text-indigo-400">${(periodStats.totalMl / 1000).toFixed(1)}<span class="text-xs ml-1">L</span></p>
                </div>
                <div class="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-2xl border border-emerald-100 dark:border-emerald-800/50">
                    <p class="text-[10px] font-bold text-emerald-800 dark:text-emerald-200 uppercase">All Unique</p>
                    <p class="text-xl font-black text-emerald-600 dark:text-emerald-400">${allStats.uniqueBeersCount}<span class="text-xs ml-1">種</span></p>
                </div>
            </div>

            <div class="glass-panel p-4 rounded-3xl relative">
                <h3 class="text-xs font-bold text-gray-400 uppercase mb-4 text-center">All-Time Style Breakdown</h3>
                <div class="h-48 w-full relative">
                    <canvas id="beerStyleChart"></canvas>
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <i class="ph-duotone ph-beer-bottle text-5xl text-gray-900 dark:text-white opacity-10"></i>
                    </div>
                </div>
            </div>

            <div id="brewery-leaderboard-section" class="glass-panel p-4 rounded-3xl relative">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-xs font-bold text-gray-400 uppercase flex items-center gap-1.5">
                        <i class="ph-fill ph-trophy text-amber-500 text-sm"></i> Brewery Leaderboard
                    </h3>
                    <span class="text-[10px] font-bold text-gray-400" id="brewery-count-label"></span>
                </div>
                <div id="brewery-axis-tabs" class="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-1 px-1"></div>
                <div id="brewery-ranking-list" class="space-y-2"></div>
            </div>
        </div>

    `;

    // チャート描画（全期間のスタイル傾向）
    renderStyleChart(allStats.styleCounts);

    // ブルワリーランキング描画
    renderBreweryLeaderboard(allStats.breweryStats || []);
}

/**
 * ビールコレクション画面の描画（独立タブ用）
 * @param {Array} periodLogs - 現在の期間のログ
 * @param {Array} allLogs - 全てのログ
 */
export function renderBeerCollection(periodLogs, allLogs) {
    const container = document.getElementById('view-cellar-collection');
    if (!container) return;

    _allLogs = allLogs;
    const allStats = Calc.getBeerStats(allLogs);
    const allBeers = allStats.beerStats || [];
    _allBeers = allBeers;
    _breweryStats = allStats.breweryStats || [];

    const uniqueBreweries = [...new Set(allBeers.map(b => b.brewery).filter(b => b && b !== 'Unknown'))].sort();
    const uniqueStyles = [...new Set(allBeers.map(b => b.style).filter(s => s && s !== 'Unknown'))].sort();

    container.innerHTML = `
        <div id="beer-collection-section">
            <div class="sticky top-0 bg-gray-50/95 dark:bg-base-900/95 backdrop-blur z-20 py-3 -mx-2 px-2 border-b border-gray-200 dark:border-gray-800">
                <div class="flex items-center justify-between mb-3 px-1">
                    <h3 class="text-lg font-black text-base-900 dark:text-white flex items-center gap-2">
                        <i class="ph-fill ph-books text-indigo-500"></i> Collection
                    </h3>
                    <span class="text-xs font-bold text-gray-400" id="beer-list-count">${allBeers.length} beers</span>
                </div>

                <div class="space-y-2">
                    <div class="relative">
                        <input type="text" id="beer-search-input" placeholder="Search brewery or brand..." class="w-full bg-white dark:bg-black border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold py-2.5 pl-9 pr-3 focus:ring-2 focus:ring-indigo-500 transition">
                        <i class="ph-bold ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    </div>

                    <div class="grid grid-cols-3 gap-2">
                        <div class="relative">
                            <select id="filter-brewery" class="w-full appearance-none bg-white dark:bg-black border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] font-bold py-2 pl-2 pr-6 truncate focus:outline-none focus:border-indigo-500">
                                <option value="">All Breweries</option>
                                ${uniqueBreweries.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('')}
                            </select>
                            <div class="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                        </div>

                        <div class="relative">
                            <select id="filter-style" class="w-full appearance-none bg-white dark:bg-black border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] font-bold py-2 pl-2 pr-6 truncate focus:outline-none focus:border-indigo-500">
                                <option value="">All Styles</option>
                                ${uniqueStyles.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
                            </select>
                            <div class="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                        </div>

                        <div class="relative">
                            <select id="filter-rating" class="w-full appearance-none bg-white dark:bg-black border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] font-bold py-2 pl-2 pr-6 truncate focus:outline-none focus:border-indigo-500">
                                <option value="0">All Ratings</option>
                                <option value="5">★ 5 Only</option>
                                <option value="4">★ 4 & up</option>
                                <option value="3">★ 3 & up</option>
                                <option value="2">★ 2 & up</option>
                            </select>
                            <div class="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
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
        if(countLabel) countLabel.textContent = `${filtered.length} beers`;

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
}

/**
 * ドーナツチャートの描画 (Chart.js)
 */
function renderStyleChart(styleCounts) {
    const ctx = document.getElementById('beerStyleChart');
    if (!ctx) return;
    if (statsChart) statsChart.destroy();

    const labels = Object.keys(styleCounts);
    const data = Object.values(styleCounts);
    
    const colorMap = {
        'gold': '#fbbf24', 'amber': '#f59e0b', 'black': '#1f2937', 
        'hazy': '#facc15', 'white': '#fcd34d', 'red': '#ef4444', 
        'pale': '#fef08a', 'copper': '#d97706', 'green': '#10b981'
    };

    const bgColors = labels.map(style => {
        const meta = STYLE_METADATA[style];
        return colorMap[meta ? meta.color : 'gold'] || '#cbd5e1';
    });

    statsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: bgColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: { 
                    backgroundColor: 'rgba(0,0,0,0.8)', 
                    bodyFont: { size: 12, weight: 'bold' }, 
                    padding: 10, 
                    cornerRadius: 8 
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
            <div class="text-center py-10 opacity-50">
                <i class="ph-duotone ph-beer-bottle text-4xl mb-2"></i>
                <p class="text-xs font-bold">No matching beers.</p>
            </div>`;
        return;
    }

    listEl.innerHTML = beers.map((beer, index) => {
        let rankBadge = `<span class="text-gray-400 font-bold text-xs">#${index + 1}</span>`;
        if (index === 0) rankBadge = `<i class="ph-duotone ph-medal text-2xl text-yellow-500 drop-shadow-sm"></i>`;
        if (index === 1) rankBadge = `<i class="ph-duotone ph-medal text-2xl text-gray-400 drop-shadow-sm"></i>`;
        if (index === 2) rankBadge = `<i class="ph-duotone ph-medal text-2xl text-amber-700 drop-shadow-sm"></i>`;

        const rating = beer.averageRating > 0 
            ? `<span class="flex items-center text-[10px] text-yellow-500 font-bold bg-yellow-50 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded gap-1"><i class="ph-fill ph-star"></i>${beer.averageRating.toFixed(1)}</span>`
            : '';

        // ★修正: STYLE_METADATAからアイコン定義を取得してレンダリング
        const styleMeta = STYLE_METADATA[beer.style];
        const iconDef = styleMeta ? styleMeta.icon : 'ph-duotone ph-beer-bottle';
        // 黒ビール系ならアイコン色を変えるなどの調整も可能
        const iconColor = (styleMeta && styleMeta.color === 'black') ? 'text-gray-700 dark:text-gray-400' : 'text-amber-500';
        
        // DOM.renderIcon でHTML生成
        const iconHtml = DOM.renderIcon(iconDef, `text-3xl ${iconColor}`);

        return `
            <div class="flex items-center bg-white dark:bg-base-800 p-3 rounded-2xl shadow-sm border border-base-100 dark:border-base-700 cursor-pointer active:scale-[0.98] transition-transform" data-beer-brewery="${escapeHtml(beer.brewery || '')}" data-beer-name="${escapeHtml(beer.name)}">
                <div class="flex-shrink-0 w-8 text-center mr-1">${rankBadge}</div>

                <div class="flex-grow min-w-0">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-[10px] font-bold text-gray-400 uppercase truncate tracking-wider">${escapeHtml(beer.brewery || 'Unknown')}</p>
                            <h4 class="text-sm font-black text-base-900 dark:text-white leading-tight">${escapeHtml(beer.name)}</h4>
                        </div>
                        <div class="text-right ml-2 flex-shrink-0">
                            <span class="block text-xl font-black text-indigo-600 dark:text-indigo-400 leading-none">${beer.count}</span>
                            <span class="text-[9px] text-gray-400 font-bold uppercase">Cups</span>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 mt-2">
                        <span class="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md truncate max-w-[100px]">${beer.style}</span>
                        ${renderRatingStars(beer.rating)}
                        <span class="ml-auto text-[10px] font-mono text-gray-400">Total: ${(beer.totalMl/1000).toFixed(1)}L</span>
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
        const base = 'flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer select-none';
        const colors = active
            ? 'bg-indigo-600 text-white shadow-sm'
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
    entries = entries.filter(b => b.brewery && b.brewery !== 'Unknown');

    if (countLabel) countLabel.textContent = `${entries.length} breweries`;

    if (entries.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-8 opacity-50">
                <i class="ph-duotone ph-warehouse text-3xl mb-2"></i>
                <p class="text-xs font-bold">No brewery data yet.</p>
            </div>`;
        return;
    }

    // 最大5件表示（展開可能に）
    const TOP_N = 5;
    const showAll = entries.length <= TOP_N + 2; // 残り1-2件なら全部出す
    const visible = showAll ? entries : entries.slice(0, TOP_N);

    listEl.innerHTML = visible.map((b, i) => {
        // バーの幅を算出 (1位を100%とする)
        const maxVal = entries[0][axis.key] || 1;
        const pct = Math.round((b[axis.key] / maxVal) * 100);
        const value = axis.format(b[axis.key]);

        let rankBadge;
        if (i === 0) rankBadge = '<i class="ph-duotone ph-crown text-lg text-yellow-500"></i>';
        else if (i === 1) rankBadge = '<span class="text-xs font-black text-gray-400">2</span>';
        else if (i === 2) rankBadge = '<span class="text-xs font-black text-amber-700">3</span>';
        else rankBadge = `<span class="text-xs font-bold text-gray-400">${i + 1}</span>`;

        // サブ情報: 現在の軸以外の主要指標を1つ表示
        const subInfo = buildBrewerySubInfo(b, axis.key);

        return `
            <div class="relative overflow-hidden rounded-xl bg-white dark:bg-base-800 border border-gray-100 dark:border-gray-800 cursor-pointer active:scale-[0.98] transition-transform" data-brewery-name="${escapeHtml(b.brewery)}">
                <div class="absolute inset-y-0 left-0 bg-indigo-50 dark:bg-indigo-900/20 transition-all duration-500" style="width: ${pct}%"></div>
                <div class="relative flex items-center gap-2.5 px-3 py-2.5">
                    <div class="flex-shrink-0 w-6 text-center">${rankBadge}</div>
                    <div class="flex-grow min-w-0">
                        <p class="text-xs font-black text-base-900 dark:text-white truncate">${escapeHtml(b.brewery)}</p>
                        <p class="text-[9px] text-gray-400 font-bold truncate">${subInfo}</p>
                    </div>
                    <div class="flex-shrink-0 text-right flex items-center gap-1.5">
                        <div>
                            <span class="text-lg font-black text-indigo-600 dark:text-indigo-400 leading-none">${value}</span>
                            <span class="text-[9px] text-gray-400 font-bold ml-0.5">${axis.unit}</span>
                        </div>
                        <i class="ph-bold ph-caret-right text-[10px] text-gray-300 dark:text-gray-600"></i>
                    </div>
                </div>
            </div>`;
    }).join('');

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
            <button id="brewery-show-all" class="w-full text-center py-2 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition">
                <i class="ph-bold ph-caret-down mr-1"></i>他 ${remaining} 件を表示
            </button>`;
        const showAllBtn = document.getElementById('brewery-show-all');
        if (showAllBtn) {
            showAllBtn.addEventListener('click', () => {
                // 残り全件を追加
                const extra = entries.slice(TOP_N);
                showAllBtn.remove();
                const fragment = extra.map((b, idx) => {
                    const i = idx + TOP_N;
                    const maxVal = entries[0][axis.key] || 1;
                    const pct = Math.round((b[axis.key] / maxVal) * 100);
                    const value = axis.format(b[axis.key]);
                    const rankBadge = `<span class="text-xs font-bold text-gray-400">${i + 1}</span>`;
                    const subInfo = buildBrewerySubInfo(b, axis.key);
                    return `
                        <div class="relative overflow-hidden rounded-xl bg-white dark:bg-base-800 border border-gray-100 dark:border-gray-800 cursor-pointer active:scale-[0.98] transition-transform" data-brewery-name="${escapeHtml(b.brewery)}">
                            <div class="absolute inset-y-0 left-0 bg-indigo-50 dark:bg-indigo-900/20 transition-all duration-500" style="width: ${pct}%"></div>
                            <div class="relative flex items-center gap-2.5 px-3 py-2.5">
                                <div class="flex-shrink-0 w-6 text-center">${rankBadge}</div>
                                <div class="flex-grow min-w-0">
                                    <p class="text-xs font-black text-base-900 dark:text-white truncate">${escapeHtml(b.brewery)}</p>
                                    <p class="text-[9px] text-gray-400 font-bold truncate">${subInfo}</p>
                                </div>
                                <div class="flex-shrink-0 text-right flex items-center gap-1.5">
                                    <div>
                                        <span class="text-lg font-black text-indigo-600 dark:text-indigo-400 leading-none">${value}</span>
                                        <span class="text-[9px] text-gray-400 font-bold ml-0.5">${axis.unit}</span>
                                    </div>
                                    <i class="ph-bold ph-caret-right text-[10px] text-gray-300 dark:text-gray-600"></i>
                                </div>
                            </div>
                        </div>`;
                }).join('');
                listEl.insertAdjacentHTML('beforeend', fragment);
            });
        }
    }
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
            <div class="absolute bottom-0 left-0 right-0 max-h-[80vh] bg-white dark:bg-base-900 rounded-t-3xl shadow-2xl overflow-hidden flex flex-col transform transition-transform duration-300 translate-y-full" id="brewery-detail-sheet">
                <div class="sticky top-0 bg-white dark:bg-base-900 z-10 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                    <div class="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-3"></div>
                    <div class="flex items-center justify-between">
                        <h3 id="brewery-detail-title" class="text-lg font-black text-base-900 dark:text-white truncate"></h3>
                        <button id="brewery-detail-close" class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">
                            <i class="ph-bold ph-x text-sm"></i>
                        </button>
                    </div>
                    <div id="brewery-detail-meta" class="flex gap-3 mt-2 text-[10px] font-bold text-gray-400"></div>
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
            `<span class="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md">${brewery.totalCount}杯</span>`,
            `<span class="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md">${brewery.uniqueBeers}種</span>`,
            `<span class="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md">${(brewery.totalMl / 1000).toFixed(1)}L</span>`
        ];
        if (brewery.ratingCount > 0) {
            metaParts.push(`<span class="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded-md flex items-center gap-0.5"><i class="ph-fill ph-star text-[9px]"></i>${brewery.averageRating.toFixed(1)}</span>`);
        }
        metaEl.innerHTML = metaParts.join('');
    }

    const listEl = document.getElementById('brewery-detail-list');
    if (listEl) {
        listEl.innerHTML = beers.map((beer, index) => {
            let rankBadge = `<span class="text-gray-400 font-bold text-xs">#${index + 1}</span>`;
            if (index === 0) rankBadge = `<i class="ph-duotone ph-medal text-xl text-yellow-500"></i>`;
            if (index === 1) rankBadge = `<i class="ph-duotone ph-medal text-xl text-gray-400"></i>`;
            if (index === 2) rankBadge = `<i class="ph-duotone ph-medal text-xl text-amber-700"></i>`;

            return `
                <div class="flex items-center bg-gray-50 dark:bg-base-800 p-3 rounded-2xl border border-gray-100 dark:border-gray-700">
                    <div class="flex-shrink-0 w-7 text-center mr-2">${rankBadge}</div>
                    <div class="flex-grow min-w-0">
                        <h4 class="text-sm font-black text-base-900 dark:text-white truncate leading-tight">${escapeHtml(beer.name)}</h4>
                        <div class="flex items-center gap-2 mt-1.5">
                            <span class="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md truncate max-w-[100px]">${escapeHtml(beer.style)}</span>
                            ${renderRatingStars(beer.averageRating)}
                        </div>
                    </div>
                    <div class="flex-shrink-0 text-right ml-2">
                        <span class="block text-lg font-black text-indigo-600 dark:text-indigo-400 leading-none">${beer.count}</span>
                        <span class="text-[9px] text-gray-400 font-bold">${(beer.totalMl / 1000).toFixed(1)}L</span>
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
}


