import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { StateManager } from './state.js';
import { DOM } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export function renderChart(logs, checks) {
    const ctxCanvas = document.getElementById('balanceChart');
    if (!ctxCanvas || typeof Chart === 'undefined') return;

    // フィルタボタンの更新
    const filters = DOM.elements['chart-filters'] || document.getElementById('chart-filters');
    if(filters) {
        filters.querySelectorAll('button').forEach(btn => {
            const isActive = btn.dataset.range === StateManager.chartRange;
            btn.className = `px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                isActive ? "active-filter bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-300 shadow-sm" 
                         : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            }`;
        });
    }

    try {
        // ★修正: StateManagerに頼らず、Canvasに紐付いている既存チャートを確実に破棄する
        const existingChart = Chart.getChart(ctxCanvas);
        if (existingChart) {
            existingChart.destroy();
        }

        const now = dayjs();
        let cutoffDate = StateManager.chartRange === '1w' ? now.subtract(7, 'day').valueOf() :
                         StateManager.chartRange === '1m' ? now.subtract(1, 'month').valueOf() :
                         now.subtract(3, 'month').valueOf();

        const profile = Store.getProfile();
        const baseEx = profile.baseExercise || 'walking';

        // --- データセット準備 ---
        const dateMap = new Map();
        
        let current = dayjs(cutoffDate);
        const end = dayjs();
        while(current.isBefore(end) || current.isSame(end, 'day')) {
            const dStr = current.format('MM/DD');
            dateMap.set(dStr, { date: dStr, balance: 0, weight: null, hasWeight: false });
            current = current.add(1, 'day');
        }

        logs.forEach(l => {
            if (l.timestamp >= cutoffDate) {
                const dStr = dayjs(l.timestamp).format('MM/DD');
                if (dateMap.has(dStr)) {
                    const val = l.kcal !== undefined ? l.kcal : (l.minutes * Calc.burnRate(6.0, profile));
                    dateMap.get(dStr).balance += val;
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
        const gridColor = isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.5)';

        const newChart = new Chart(ctxCanvas, {
            type: 'bar',
            data: {
                labels: dataArray.map(d => d.date),
                datasets: [
                    { 
                        label: 'Earned', 
                        data: dataArray.map(d => d.balance > 0 ? Math.round(Calc.convertKcalToMinutes(d.balance, baseEx, profile)) : 0), 
                        backgroundColor: '#10B981', 
                        borderRadius: 4,
                        stack: '0', 
                        order: 2,
                        yAxisID: 'y'
                    },
                    { 
                        label: 'Consumed', 
                        data: dataArray.map(d => d.balance < 0 ? Math.round(Calc.convertKcalToMinutes(d.balance, baseEx, profile)) : 0), 
                        backgroundColor: '#EF4444', 
                        borderRadius: 4,
                        stack: '0', 
                        order: 3,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: 'Weight',
                        data: dataArray.map(d => d.weight),
                        borderColor: '#6366F1',
                        backgroundColor: '#6366F1',
                        borderWidth: 2,
                        pointRadius: 3,
                        tension: 0.3,
                        yAxisID: 'y1',
                        order: 1,
                        spanGaps: true
                    }
                ] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                scales: { 
                    x: { 
                        stacked: true,
                        ticks: { color: textColor, font: { size: 10 } },
                        grid: { display: false }
                    }, 
                    y: { 
                        beginAtZero: true,
                        position: 'left',
                        title: { display: false },
                        ticks: { color: textColor, font: { size: 10 } },
                        grid: { color: gridColor }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: weightMin,
                        max: weightMax,
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#6366F1', font: { size: 10, weight: 'bold' } }
                    }
                }, 
                plugins: { 
                    legend: { 
                        display: true, 
                        position: 'bottom', 
                        labels: { color: textColor, boxWidth: 10, font: { size: 10 } } 
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                } 
            }
        });
        
        // StateManagerへの保存は行うが、破棄ロジックは上記 Chart.getChart に任せる
        if (StateManager.setChart) {
            StateManager.setChart(newChart);
        }

    } catch(e) { console.error('Chart Error', e); }
}