// frontend_soa/src/services/liveIndicator.service.js
import { store } from '../state/store.js';
import { showToast } from '../ui/helpers.js';

class LiveIndicatorService {
    constructor(store) {
        this.store = store;
        this.socket = null;
        this.connectionParams = null;
    }

    connect(params) {
        this.disconnect(); // Ensure any old connection is closed
        this.connectionParams = params;

        const { symbol, exchange, timeframes, regression_length, lookback_periods } = params;
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        
        const queryParams = new URLSearchParams({
            timeframes: timeframes.join(','),
            timezone: this.store.get('selectedTimezone'),
            regression_length: regression_length,
            lookback_periods: lookback_periods.join(',')
        });

        const wsURL = `${wsProtocol}//${window.location.hostname}:8000/ws/live-regression/${encodeURIComponent(symbol)}/${encodeURIComponent(exchange)}?${queryParams.toString()}`;
        
        showToast('Connecting to live regression feed...', 'info');
        this.socket = new WebSocket(wsURL);
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.socket.onopen = () => {
            showToast('Live regression feed connected!', 'success');
            this.store.set('isLiveRegressionConnected', true);
        };

        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'live_regression_update') {
                this.handleLiveUpdate(message);
            }
        };

        this.socket.onclose = () => {
            console.log('Live regression WebSocket closed.');
            this.store.set('isLiveRegressionConnected', false);
        };

        this.socket.onerror = (error) => {
            console.error('Live regression WebSocket error:', error);
            showToast('Live regression connection error.', 'error');
            this.store.set('isLiveRegressionConnected', false);
        };
    }

    handleLiveUpdate(data) {
        const currentResults = this.store.get('regressionResults');
        if (!currentResults || !currentResults.regression_results) return;

        const { timeframe, results } = data;

        // Find the timeframe to update
        const timeframeResult = currentResults.regression_results.find(
            (res) => res.timeframe === timeframe
        );

        if (timeframeResult) {
            // Update the results for the specific timeframe
            Object.keys(results).forEach(lookback => {
                if (timeframeResult.results[lookback]) {
                    timeframeResult.results[lookback] = results[lookback];
                }
            });

            // Notify the store that the results have been updated
            this.store.set('regressionResults', { ...currentResults });
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
            this.socket = null;
            console.log('Live regression WebSocket disconnected.');
            this.store.set('isLiveRegressionConnected', false);
        }
    }
}

export const liveIndicatorService = new LiveIndicatorService(store);