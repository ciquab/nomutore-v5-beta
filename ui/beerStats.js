import { Calc } from '../logic.js';
import { DOM, escapeHtml } from './dom.js';
import { STYLE_METADATA } from '../constants.js';

let statsChart = null;

// フィルター状態管理
let activeFilters = {
    term: '',
    brewery: '',
    style: '',
    rating: 0
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

    // ユニークなリストの抽出（フィルター選択肢用：全期間ベース）
    const uniqueBreweries = [...new Set(allBeers.map(b => b.brewery).filter(b => b && b !== 'Unknown'))].sort();
    const uniqueStyles = [...new Set(allBeers.map(b => b.style).filter(s => s && s !== 'Unknown'))].sort();

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
                        <span class="text-3xl font-black text-base-900 dark:text-white opacity-20">🍺</span>
                    </div>
                </div>
            </div>

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

                <div id="beer-ranking-list" class="space-y-3 mt-4">
                    </div>
            </div>
        </div>
    `;

    // チャート描画（全期間のスタイル傾向）
    renderStyleChart(allStats.styleCounts);

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

        // 件数更新
        const countLabel = document.getElementById('beer-list-count');
        if(countLabel) countLabel.textContent = `${filtered.length} beers`;

        renderBeerList(filtered);
    };

    // イベントリスナーの登録
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
    
    // 初期描画（全件表示）
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
        let rankBadge = `<span class="text-xs font-bold text-gray-300 w-6 text-center">#${index + 1}</span>`;
        if (index === 0) rankBadge = `<span class="text-lg">🥇</span>`;
        if (index === 1) rankBadge = `<span class="text-lg">🥈</span>`;
        if (index === 2) rankBadge = `<span class="text-lg">🥉</span>`;

        const rating = beer.averageRating > 0 
            ? `<span class="flex items-center text-[10px] text-yellow-500 font-bold bg-yellow-50 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded gap-1"><i class="ph-fill ph-star"></i>${beer.averageRating.toFixed(1)}</span>`
            : '';

        return `
            <div class="flex items-center bg-white dark:bg-base-800 p-3 rounded-2xl shadow-sm border border-base-100 dark:border-base-700">
                <div class="flex-shrink-0 w-8 text-center mr-1">${rankBadge}</div>
                
                <div class="flex-grow min-w-0">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-[10px] font-bold text-gray-400 uppercase truncate tracking-wider">${escapeHtml(beer.brewery || 'Unknown')}</p>
                            <h4 class="text-sm font-black text-base-900 dark:text-white truncate leading-tight">${escapeHtml(beer.name)}</h4>
                        </div>
                        <div class="text-right ml-2">
                            <span class="block text-xl font-black text-indigo-600 dark:text-indigo-400 leading-none">${beer.count}</span>
                            <span class="text-[9px] text-gray-400 font-bold uppercase">Cups</span>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-2 mt-2">
                        <span class="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md truncate max-w-[100px]">${beer.style}</span>
                        ${rating}
                        <span class="ml-auto text-[10px] font-mono text-gray-400">Total: ${(beer.totalMl/1000).toFixed(1)}L</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}