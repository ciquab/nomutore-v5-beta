import { APP } from '../constants.js';

// 内部状態（直接アクセス禁止）
const _state = { 
    beerMode: localStorage.getItem('nomutore_home_beer_mode') || 'mode1', 
    chart: null, 
    timerId: null,
    chartRange: '1w',
    isEditMode: false,
    heatmapOffset: 0,
    logLimit: 50,
    isLoadingLogs: false,
    cellarViewMode: 'logs',
    selectedDate: null // ★追加: 日付選択状態
};

// 状態マネージャー
export const StateManager = {
    get beerMode() { return _state.beerMode; },
    get chart() { return _state.chart; },
    get timerId() { return _state.timerId; },
    get chartRange() { return _state.chartRange; },
    get isEditMode() { return _state.isEditMode; },
    get heatmapOffset() { return _state.heatmapOffset; },
    get logLimit() { return _state.logLimit; },
    get isLoadingLogs() { return _state.isLoadingLogs; },
    get cellarViewMode() { return _state.cellarViewMode; },
    get selectedDate() { return _state.selectedDate; }, // ★追加 getter

    setBeerMode: (v) => { 
        _state.beerMode = v; 
        localStorage.setItem('nomutore_home_beer_mode', v);
    },
    setChart: (v) => { if(_state.chart) _state.chart.destroy(); _state.chart = v; },
    setTimerId: (v) => { _state.timerId = v; },
    setChartRange: (v) => { _state.chartRange = v; },
    setIsEditMode: (v) => { _state.isEditMode = v; }, 
    setHeatmapOffset: (v) => { _state.heatmapOffset = v; },
    
    incrementLogLimit: (amount) => { _state.logLimit += amount; },
    setLogLimit: (v) => { _state.logLimit = v; },
    setLogLoading: (v) => { _state.isLoadingLogs = v; },
    
    setCellarViewMode: (v) => { _state.cellarViewMode = v; },
    setSelectedDate: (v) => { _state.selectedDate = v; } // ★追加 setter
};