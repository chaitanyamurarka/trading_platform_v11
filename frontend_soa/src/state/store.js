// frontend_soa/src/state/store.js
class Store {
    constructor(initialState) {
        this.state = initialState;
        this.subscribers = {};
    }

    get(key) {
        return this.state[key];
    }

    set(key, value) {
        if (this.state[key] === value) return; // No change
        this.state[key] = value;
        console.log(`%cSTATE_UPDATE: ${key}`, 'color: #7f00ff', value);
        this.notify(key);
        
        // NEW: Auto-sync datetime inputs when store values change
        this.syncTimeInputs(key, value);
    }

    subscribe(key, callback) {
        if (!this.subscribers[key]) {
            this.subscribers[key] = [];
        }
        this.subscribers[key].push(callback);
        // Immediately call back with the current value
        callback(this.state[key]);
        return () => {
            this.subscribers[key] = this.subscribers[key].filter(sub => sub !== callback);
        };
    }

    notify(key) {
        (this.subscribers[key] || []).forEach(cb => cb(this.state[key]));
    }

    // NEW: Sync time inputs when store values change
    syncTimeInputs(key, value) {
        if (key === 'startTime' || key === 'endTime') {
            const element = document.getElementById(key === 'startTime' ? 'start_time' : 'end_time');
            if (element && element.value !== value) {
                element.value = value || '';
            }
        }
    }
}

const initialState = {
    // Session
    sessionToken: null,
    availableSymbols: [],

    // UI & Chart Parameters
    selectedSymbol: 'SPY',
    selectedExchange: 'NASDAQ',
    selectedInterval: '1m',
    selectedTimezone: 'America/New_York',
    selectedCandleType: 'regular',
    selectedChartType: 'candlestick',
    isLiveMode: false,
    
    // Theme
    theme: 'light',
    
    // Time parameters
    startTime: null,
    endTime: null,

    // Data State
    isLoading: false,
    chartData: [],
    volumeData: [],
    dataRequestId: null,
    allDataLoaded: false,

    // Indicator State
    isIndicatorActive: false,
    isIndicatorLoading: false,
    regressionResults: null,
    isLiveRegressionConnected: false,

    // Settings State
    showOHLCLegend: true,
    seriesColors: null,
};

export const store = new Store(initialState);