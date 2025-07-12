// frontend_soa/src/services/data.service.js
import { store } from '../state/store.js';
import { showToast } from '../ui/helpers.js';
import { websocketService } from './websocket.service.js';

const API_BASE_URL = `http://${window.location.hostname}:8000`;

class DataService {
    constructor(store) {
        this.store = store;
        this.isFetching = false;
        this.isPaginating = false;
    }

    initialize() {
        // Subscribe to changes that require a full data reload
        this.store.subscribe('selectedSymbol', () => this.loadInitialChartData());
        this.store.subscribe('selectedInterval', () => this.loadInitialChartData());
        this.store.subscribe('selectedTimezone', () => this.loadInitialChartData());
        this.store.subscribe('selectedCandleType', () => this.loadInitialChartData());

        // Handle live mode toggling
        this.store.subscribe('isLiveMode', (isLive) => this.handleLiveMode(isLive));
        console.log('DataService Initialized');
    }

    handleLiveMode(isLive) {
        if (isLive) {
            // Re-fetch the latest data before connecting to WebSocket
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
        if (!token || this.isFetching) return;

        this.isFetching = true;
        this.store.set('isLoading', true);

        try {
            const candleType = this.store.get('selectedCandleType');
            const endpoint = candleType === 'heikin_ashi' ? 'heikin-ashi' : 'historical';
            
            const params = new URLSearchParams({
                session_token: token,
                exchange: 'NASDAQ', // Or from state if dynamic
                token: this.store.get('selectedSymbol'),
                interval: this.store.get('selectedInterval'),
                timezone: this.store.get('selectedTimezone'),
                // start_time/end_time can be added here
            });

            const res = await fetch(`${API_BASE_URL}/${endpoint}/?${params.toString()}`);
            if (!res.ok) throw new Error(await res.text());
            
            const data = await res.json();
            this.processAndStoreData(data);
            showToast(data.message, 'success');

        } catch (error) {
            console.error("Failed to load chart data:", error);
            showToast('Error loading chart data.', 'error');
            this.store.set('chartData', []);
            this.store.set('volumeData', []);
        } finally {
            this.isFetching = false;
            this.store.set('isLoading', false);
        }
    }

    processAndStoreData(data) {
        const chartData = data.candles.map(c => ({ time: c.unix_timestamp, open: c.open, high: c.high, low: c.low, close: c.close }));
        const volumeData = data.candles.map(c => ({ time: c.unix_timestamp, value: c.volume || 0, color: c.close >= c.open ? '#10b98180' : '#ef444480' }));

        this.store.set('chartData', chartData);
        this.store.set('volumeData', volumeData);
        this.store.set('dataRequestId', data.request_id);
        this.store.set('allDataLoaded', !data.is_partial);
    }
    
    // You can add loadMoreData for pagination (infinite scroll) here
}

export const dataService = new DataService(store);