// @ts-check
import { FLAVOR_AXES } from '../constants.js';

// Beer関連ビューの共有コンテキスト（モジュール内限定）
export const beerStatsContext = {
    allBeers: [],
    breweryStats: [],
    allLogs: [],
    latestBeerLogMap: new Map(),
    breweryFlavorAvgMap: new Map()
};

export const buildBeerIdentityKey = (brewery = '', name = '') => `${(brewery || '').trim()}::${(name || '').trim()}`;

export const setBeerStatsContext = (allLogs = [], allBeers = [], breweryStats = []) => {
    beerStatsContext.allLogs = [...(allLogs || [])];
    beerStatsContext.allBeers = [...(allBeers || [])];
    beerStatsContext.breweryStats = [...(breweryStats || [])];

    const latestBeerLogMap = new Map();
    const breweryFlavorAggMap = new Map();

    for (const log of beerStatsContext.allLogs) {
        if (log.type !== 'beer') continue;

        const key = buildBeerIdentityKey(log.brewery || '', log.brand || log.name || '');
        const prev = latestBeerLogMap.get(key);
        if (!prev || (log.timestamp || 0) > (prev.timestamp || 0)) {
            latestBeerLogMap.set(key, log);
        }

        if (!log.flavorProfile || !log.brewery) continue;
        const brewery = (log.brewery || '').trim();
        if (!brewery) continue;

        if (!breweryFlavorAggMap.has(brewery)) {
            breweryFlavorAggMap.set(brewery, {
                sums: Object.fromEntries(FLAVOR_AXES.map(a => [a.key, 0])),
                counts: Object.fromEntries(FLAVOR_AXES.map(a => [a.key, 0]))
            });
        }

        const agg = breweryFlavorAggMap.get(brewery);
        FLAVOR_AXES.forEach(a => {
            const v = log.flavorProfile?.[a.key];
            if (v !== null && v !== undefined) {
                agg.sums[a.key] += v;
                agg.counts[a.key] += 1;
            }
        });
    }

    const breweryFlavorAvgMap = new Map();
    breweryFlavorAggMap.forEach((agg, brewery) => {
        const avg = {};
        let hasData = false;
        FLAVOR_AXES.forEach(a => {
            if (agg.counts[a.key] > 0) {
                avg[a.key] = Math.round((agg.sums[a.key] / agg.counts[a.key]) * 10) / 10;
                hasData = true;
            } else {
                avg[a.key] = 0;
            }
        });
        if (hasData) breweryFlavorAvgMap.set(brewery, avg);
    });

    beerStatsContext.latestBeerLogMap = latestBeerLogMap;
    beerStatsContext.breweryFlavorAvgMap = breweryFlavorAvgMap;
};

export const renderRatingStars = (score) => {
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

