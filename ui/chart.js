// @ts-check
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { StateManager } from './state.js';
import { DOM } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export function renderChart(logs, checks) {
    // まず古いCanvasを取得（IDで検索）
    const oldCanvas = document.getElementById('balanceChart');
    if (!oldCanvas || typeof Chart === 'undefined') return;

    // フィルタボタンの更新
    const filters = DOM.elements['chart-filters'] || document.getElementById('chart-filters');
    if(filters) {
        filters.querySelectorAll('button').forEach(btn => {
            // ▼▼▼ 追加: ActionRouter用の設定 ▼▼▼
            const range = btn.dataset.range;
            btn.dataset.action = 'chart:period'; // アクション名
            btn.dataset.args = JSON.stringify({ range }); // 引数 (1w, 1m, 3m)
            // ▲▲▲ 追加ここまで ▲▲▲
            const isActive = btn.dataset.range === StateManager.chartRange;
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            btn.className = `px-2 py-1 text-[11px] font-bold rounded-md transition-all ${
                isActive ? "active-filter bg-white dark:bg-gray-600 text-brand dark:text-indigo-300 shadow-sm"
                         : "text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            }`;
        });
    }

    try {
        // 1. 既存のチャートインスタンスがあれば破棄
        const existingChart = Chart.getChart(oldCanvas);
        if (existingChart) {
            existingChart.destroy();
        }

        // ▼▼▼ 追加: Canvas要素自体を再生成してメモリリークを防止 (Memory Leak Fix) ▼▼▼
        const parent = oldCanvas.parentNode;
        const newCanvas = document.createElement('canvas');
        
        // IDとクラス名を引き継ぐ
        newCanvas.id = 'balanceChart';
        newCanvas.className = oldCanvas.className; 
        
        // 古いCanvasを新しいCanvasに置換（これで古いリスナーも消滅）
        parent.replaceChild(newCanvas, oldCanvas);

        // 以降は新しいCanvasに対して描画を行う
        const ctxCanvas = newCanvas;
        // ▲▲▲ 追加終了 ▲▲▲

        const now = dayjs();
        let cutoffDate = StateManager.chartRange === '1w' ? now.subtract(7, 'day').valueOf() :
                         StateManager.chartRange === '1m' ? now.subtract(1, 'month').valueOf() :
                         now.subtract(3, 'month').valueOf();

        const profile = Store.getProfile();

        // --- データセット準備 ---
        const dateMap = new Map();
        
        let current = dayjs(cutoffDate);
        const end = dayjs();
        while(current.isBefore(end) || current.isSame(end, 'day')) {
            const dStr = current.format('MM/DD');
            // ★修正1: earned(稼ぎ)とconsumed(消費)を別々に集計するための箱を用意
            dateMap.set(dStr, { date: dStr, earned: 0, consumed: 0, weight: null, hasWeight: false });
            current = current.add(1, 'day');
        }

        logs.forEach(l => {
            if (l.timestamp >= cutoffDate) {
                const dStr = dayjs(l.timestamp).format('MM/DD');
                if (dateMap.has(dStr)) {
                    const val = l.kcal !== undefined ? l.kcal : (l.minutes * Calc.burnRate(6.0, profile));
                    
                    // ★修正2: プラスならEarned、マイナスならConsumedに加算（相殺させない）
                    if (val > 0) {
                        dateMap.get(dStr).earned += val;
                    } else {
                        dateMap.get(dStr).consumed += val; // 負の値として加算
                    }
                }
            }
        });

        checks.forEach(c => {
            if (c.timestamp >= cutoffDate && c.weight) {
                const dStr = dayjs(c.timestamp).format('MM/DD');
                if (dateMap.has(dStr)) {
                    dateMap.get(dStr).weight = parseFloat(c.weight);
                    dateMap.get(dStr).hasWeight = true;
                }
            }
        });

        const dataArray = Array.from(dateMap.values());

        const weights = dataArray.filter(d => d.hasWeight).map(d => d.weight);
        let weightMin = 40, weightMax = 100;
        if (weights.length > 0) {
            weightMin = Math.min(...weights) - 2.0;
            weightMax = Math.max(...weights) + 2.0;
        }

        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#9CA3AF' : '#6B7280';

        const newChart = new Chart(ctxCanvas, {
            type: 'bar',
            data: {
                labels: dataArray.map(d => d.date),
                datasets: [
                    {
                        label: '返済',
                        data: dataArray.map(d => Math.round(d.earned)),
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderRadius: 4,
                        stack: '0',
                        order: 2,
                        yAxisID: 'y'
                    },
                    {
                        label: '借金',
                        data: dataArray.map(d => Math.round(d.consumed)),
                        backgroundColor: 'rgba(239, 68, 68, 0.5)',
                        borderRadius: 4,
                        stack: '0',
                        order: 3,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: '体重',
                        data: dataArray.map(d => d.weight),
                        borderColor: '#6366F1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#6366F1',
                        tension: 0.3,
                        yAxisID: 'y1',
                        order: 1,
                        spanGaps: true,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: textColor, font: { size: 9, weight: 'bold' }, maxRotation: 45 },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        position: 'left',
                        ticks: { color: textColor, font: { size: 9 }, callback: v => `${v}kcal` },
                        grid: { color: isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(0,0,0,0.05)' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: weightMin,
                        max: weightMax,
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#6366F1', font: { size: 9, weight: 'bold' }, callback: v => `${v}kg` }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: { color: textColor, boxWidth: 8, padding: 12, font: { size: 9, weight: 'bold' } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        bodyFont: { size: 11, weight: 'bold' },
                        padding: 8,
                        cornerRadius: 8,
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.dataset.label === '体重') return `体重: ${ctx.raw ?? '-'}kg`;
                                return `${ctx.dataset.label}: ${ctx.raw ?? 0}kcal`;
                            }
                        }
                    }
                }
            }
        });
        
        if (StateManager.setChart) {
            StateManager.setChart(newChart);
        }

    } catch(e) { console.error('Chart Error', e); }

}
