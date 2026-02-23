// @ts-check
import { Calc } from '../logic.js';
import { DOM, escapeHtml } from './dom.js';
import { STYLE_METADATA, FLAVOR_AXES, FLAVOR_SCALE_MAX } from '../constants.js';
import { openLogDetail } from './logDetail.js';
import { beerStatsContext, setBeerStatsContext, buildBeerIdentityKey, renderRatingStars } from './beerStatsShared.js';

export function renderBeerCollection(periodLogs, allLogs) {
    const container = document.getElementById('view-cellar-collection');
    if (!container) return;

    const allStats = Calc.getBeerStats(allLogs);
    const allBeers = allStats.beerStats || [];
    setBeerStatsContext(allLogs, allBeers, allStats.breweryStats || []);

    const uniqueBreweries = [...new Set(allBeers.map(b => b.brewery).filter(b => b && b !== 'Unknown'))].sort();
    const uniqueStyles = [...new Set(allBeers.map(b => b.style).filter(s => s && s !== 'Unknown'))].sort();

    container.innerHTML = `
        <div id="beer-collection-section">
            <section id="brewery-leaderboard-section" class="px-1 mb-2">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="section-title text-sm font-bold text-base-900 dark:text-white">ブルワリーランキング</h3>
                    <span class="text-[11px] font-semibold text-gray-500 dark:text-gray-400" id="brewery-count-label"></span>
                </div>
                <p class="section-helper mt-1">軸を切り替えてブルワリー傾向を比較できます</p>
            </section>
            <div id="brewery-axis-tabs" class="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-1 px-1"></div>
            <div id="brewery-ranking-list" class="space-y-2 mb-4"></div>

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

    const activeFilters = { term: '', brewery: '', style: '', rating: 0 };

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

        renderBeerList(filtered, beerStatsContext.latestBeerLogMap);
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

    applyFilters();

    // ブルワリーランキング描画
    renderBreweryLeaderboard(allStats.breweryStats || [], beerStatsContext);
}


function renderBeerList(beers, latestBeerLogMap = beerStatsContext.latestBeerLogMap) {
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
                        ${hasFlavorProfile(beer, latestBeerLogMap) ? '<span class="text-[11px] text-orange-500 font-bold bg-orange-50 dark:bg-orange-900/30 px-1.5 py-0.5 rounded"><i class="ph-duotone ph-chart-polar text-[11px]" aria-hidden="true"></i></span>' : ''}
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
        
        // 事前計算済みの最新ログをO(1)で参照
        const matchingLog = latestBeerLogMap.get(buildBeerIdentityKey(brewery, name));
            
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
function renderBreweryLeaderboard(breweryStats, context = beerStatsContext) {
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
            renderBreweryLeaderboard(breweryStats, context);
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
            showBreweryDetail(target.dataset.breweryName, context);
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
        <div class="item-row px-3 py-3 cursor-pointer active:scale-[0.98] transition-transform bg-white dark:bg-base-900 border border-base-100 dark:border-base-700 shadow-sm" data-brewery-name="${escapeHtml(brewery.brewery)}">
            <div class="flex items-center gap-3">
                <div class="flex-shrink-0 w-7 text-center">${rankBadge}</div>
                <div class="flex-grow min-w-0">
                    <div class="flex items-center justify-between gap-2">
                        <p class="text-sm font-black text-base-900 dark:text-white truncate">${escapeHtml(brewery.brewery)}</p>
                        <p class="text-xs font-black text-brand dark:text-brand-light whitespace-nowrap">${value}${axis.unit}</p>
                    </div>
                    <p class="text-xs text-gray-500 dark:text-gray-400 font-bold truncate mt-1">${subInfo}</p>
                    <div class="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-base-800 overflow-hidden" aria-hidden="true">
                        <div class="h-full rounded-full bg-indigo-500 dark:bg-indigo-500" style="width: ${pct}%"></div>
                    </div>
                </div>
                <i class="ph-bold ph-caret-right text-xs text-gray-300 dark:text-gray-600 flex-shrink-0" aria-hidden="true"></i>
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
function showBreweryDetail(breweryName, context = beerStatsContext) {
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
    const brewery = context.breweryStats.find(b => b.brewery === breweryName);
    const beers = context.allBeers.filter(b => b.brewery === breweryName).sort((a, b) => b.count - a.count);

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
        const avgProfile = calcBreweryAvgFlavor(breweryName, context);
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
 * 事前計算済み latestBeerLogMap から味わい情報の有無を判定
 */
function hasFlavorProfile(beer, latestBeerLogMap = beerStatsContext.latestBeerLogMap) {
    const key = buildBeerIdentityKey(beer.brewery || '', beer.name || '');
    const log = latestBeerLogMap.get(key);
    return !!log?.flavorProfile;
}

/**
 * ブルワリーの味わい平均を計算
 * @param {string} breweryName
 * @returns {Record<string, number>|null}
 */
function calcBreweryAvgFlavor(breweryName, context = beerStatsContext) {
    const key = (breweryName || '').trim();
    return context.breweryFlavorAvgMap.get(key) || null;
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
