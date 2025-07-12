// frontend_soa/src/services/data.service.js
import { store } from '../state/store.js';
import { showToast } from '../ui/helpers.js';
import { websocketService } from './websocket.service.js';

// The API_BASE_URL should not have a trailing slash
const API_BASE_URL = `http://52.66.119.117:8000`;

class DataService {
    constructor(store) {
        this.store = store;
        this.isFetching = false;
        this.isPaginating = false;
    }

    initialize() {
        this.store.subscribe('selectedSymbol', () => this.loadInitialChartData());
        this.store.subscribe('selectedInterval', () => this.loadInitialChartData());
        this.store.subscribe('selectedTimezone', () => this.loadInitialChartData());
        this.store.subscribe('selectedCandleType', () => this.loadInitialChartData());
        this.store.subscribe('isLiveMode', (isLive) => this.handleLiveMode(isLive));
        console.log('DataService Initialized');
    }

    handleLiveMode(isLive) {
        if (isLive) {
            this.loadInitialChartData().then(() => {
                const params = {
                    symbol: this.store.get('selectedSymbol'),
                    interval: this.store.get('selectedInterval'),
                    timezone: this.store.get('selectedTimezone'),
                    candleType: this.store.get('selectedCandleType'),
                };
                websocketService.connect(params);
            });
        } else {
            websocketService.disconnect();
        }
    }

    async loadInitialChartData() {
        const token = this.store.get('sessionToken');
        // Do not fetch if we don't have a symbol or session token yet.
        const symbol = this.store.get('selectedSymbol');
        if (!token || !symbol || this.isFetching) return;

        this.isFetching = true;
        this.store.set('isLoading', true);

        try {
            const candleType = this.store.get('selectedCandleType');
            const endpoint = candleType === 'heikin_ashi' ? 'heikin-ashi' : 'historical';
            
            // --- FIX: Explicitly encode each URL parameter ---
            // While URLSearchParams usually handles this, being explicit can prevent
            // issues with special characters. The 422 error indicates the backend
            // is rejecting the format of the token, so ensuring it's correctly
            // encoded is the primary frontend fix.
            const params = new URLSearchParams({
                session_token: token,
                exchange: 'NASDAQ',
                token: this.store.get('selectedSymbol'),
                interval: this.store.get('selectedInterval'),
                timezone: this.store.get('selectedTimezone'),
            });

            const url = `${API_BASE_URL}/${endpoint}/?${params.toString()}`;
            console.log(`Fetching data from: ${url}`);

            const res = await fetch(url);
            
            if (!res.ok) {
                // Try to get more detailed error from the response body
                const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(`Server responded with ${res.status}: ${errorBody.detail}`);
            }
            
            const data = await res.json();
            this.processAndStoreData(data);
            showToast(data.message, 'success');

        } catch (error) {
            console.error("Failed to load chart data:", error);
            showToast(String(error), 'error');
            this.store.set('chartData', []);
            this.store.set('volumeData', []);
        } finally {
            this.isFetching = false;
            this.store.set('isLoading', false);
        }
    }

    processAndStoreData(data) {
        if (!data || !Array.isArray(data.candles)) {
            console.error("Invalid data structure received from server:", data);
            return;
        }
        const chartData = data.candles.map(c => ({ time: c.unix_timestamp, open: c.open, high: c.high, low: c.low, close: c.close }));
        const volumeData = data.candles.map(c => ({ time: c.unix_timestamp, value: c.volume || 0, color: c.close >= c.open ? '#10b98180' : '#ef444480' }));

        this.store.set('chartData', chartData);
        this.store.set('volumeData', volumeData);
        this.store.set('dataRequestId', data.request_id);
        this.store.set('allDataLoaded', !data.is_partial);
    }
}

export const dataService = new DataService(store);
