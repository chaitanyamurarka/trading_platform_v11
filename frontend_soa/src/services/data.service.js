// frontend_soa/src/services/data.service.js
import { store } from '../state/store.js';
import { showToast } from '../ui/helpers.js';
import { websocketService } from './websocket.service.js';
import { setAutomaticDateTime } from '../ui/helpers.js'; // Add this import

const API_BASE_URL = `http://52.66.119.117:8000`;

class DataService {
    constructor(store) {
        this.store = store;
        this.isFetching = false;
        this.isPaginating = false;
    }

    initialize() {
        // Set automatic date/time on initialization
        setAutomaticDateTime();
        
        this.store.subscribe('selectedSymbol', () => this.loadInitialChartData());
        this.store.subscribe('selectedInterval', () => this.loadInitialChartData());
        this.store.subscribe('selectedTimezone', () => this.loadInitialChartData());
        this.store.subscribe('selectedCandleType', () => this.loadInitialChartData());
        this.store.subscribe('isLiveMode', (isLive) => this.handleLiveMode(isLive));
        console.log('DataService Initialized');
    }

    handleLiveMode(isLive) {
        if (isLive) {
            // Set automatic date/time when enabling live mode
            setAutomaticDateTime();
            
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
        const symbol = this.store.get('selectedSymbol');
        if (!token || !symbol || this.isFetching) return;

        this.isFetching = true;
        this.store.set('isLoading', true);

        try {
            const candleType = this.store.get('selectedCandleType');
            const endpoint = candleType === 'heikin_ashi' ? 'heikin-ashi' : 'historical';
            
            // Get start and end times from store
            const startTime = this.store.get('startTime');
            const endTime = this.store.get('endTime');
            
            if (!startTime || !endTime) {
                throw new Error('Start time and end time are required');
            }
            
            const params = new URLSearchParams({
                session_token: token,
                exchange: 'NASDAQ',
                token: symbol,
                interval: this.store.get('selectedInterval'),
                start_time: startTime,
                end_time: endTime,
                timezone: this.store.get('selectedTimezone'),
            });

            const url = `${API_BASE_URL}/${endpoint}/?${params.toString()}`;
            console.log(`Fetching data from: ${url}`);

            const res = await fetch(url);
            
            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(`Server responded with ${res.status}: ${errorBody.detail}`);
            }
            
            const data = await res.json();
            this.processAndStoreData(data);
            showToast(data.message || 'Data loaded successfully', 'success');

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

    // Add method for fetching next chunk of data
    async fetchNextChunk() {
        const requestId = this.store.get('dataRequestId');
        if (!requestId || this.isPaginating || this.store.get('allDataLoaded')) return;

        this.isPaginating = true;
        
        try {
            const candleType = this.store.get('selectedCandleType');
            const endpoint = candleType === 'heikin_ashi' ? 'heikin-ashi/chunk' : 'historical/chunk';
            
            const params = new URLSearchParams({
                request_id: requestId,
                offset: 0, // Not used in cursor-based pagination
                limit: 5000
            });

            const url = `${API_BASE_URL}/${endpoint}?${params.toString()}`;
            const res = await fetch(url);
            
            if (!res.ok) throw new Error('Failed to fetch chunk');
            
            const data = await res.json();
            
            if (data.candles && data.candles.length > 0) {
                this.appendChunkData(data);
            }
            
        } catch (error) {
            console.error("Failed to fetch next chunk:", error);
            showToast('Error loading more data', 'error');
        } finally {
            this.isPaginating = false;
        }
    }

    appendChunkData(data) {
        const newChartData = data.candles.map(c => ({ 
            time: c.unix_timestamp, 
            open: c.open, 
            high: c.high, 
            low: c.low, 
            close: c.close 
        }));
        
        const newVolumeData = data.candles.map(c => ({ 
            time: c.unix_timestamp, 
            value: c.volume || 0, 
            color: c.close >= c.open ? '#10b98180' : '#ef444480' 
        }));

        // Prepend new data to existing data
        const existingChartData = this.store.get('chartData') || [];
        const existingVolumeData = this.store.get('volumeData') || [];
        
        this.store.set('chartData', [...newChartData, ...existingChartData]);
        this.store.set('volumeData', [...newVolumeData, ...existingVolumeData]);
        this.store.set('dataRequestId', data.request_id);
        this.store.set('allDataLoaded', !data.is_partial);
        
        showToast(`Loaded ${data.candles.length} more candles`, 'success');
    }
}

export const dataService = new DataService(store);