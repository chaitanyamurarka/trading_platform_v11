// frontend_soa/src/services/data.service.js
import { store } from '../state/store.js';
import { showToast } from '../ui/helpers.js';
import { websocketService } from './websocket.service.js';
import { setAutomaticDateTime } from '../ui/helpers.js';

// Use dynamic API URL based on environment
const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8000`;

class DataService {
    constructor(store) {
        this.store = store;
        this.isFetching = false;
        this.isPaginating = false;
    }

    initialize() {
        // Set automatic date/time on initialization
        setAutomaticDateTime();
        
        // Subscribe to changes that should trigger data reload
        this.store.subscribe('selectedSymbol', () => this.loadInitialChartData());
        this.store.subscribe('selectedInterval', () => this.loadInitialChartData());
        this.store.subscribe('selectedTimezone', () => this.loadInitialChartData());
        this.store.subscribe('selectedCandleType', () => this.loadInitialChartData());
        this.store.subscribe('startTime', () => this.loadInitialChartData());
        this.store.subscribe('endTime', () => this.loadInitialChartData());
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
        const startTime = this.store.get('startTime');
        const endTime = this.store.get('endTime');
        
        if (!token || !symbol || this.isFetching) return;
        
        // Skip loading if we don't have required time parameters
        if (!startTime || !endTime) {
            console.log('Skipping chart data load - missing time parameters');
            return;
        }

        this.isFetching = true;
        this.store.set('isLoading', true);

        try {
            const candleType = this.store.get('selectedCandleType');
            const interval = this.store.get('selectedInterval');
            
            // Determine endpoint based on candle type and interval
            let endpoint = 'historical';
            if (interval.includes('tick')) {
                endpoint = 'tick';
            } else if (candleType === 'heikin_ashi') {
                endpoint = 'heikin-ashi';
            }
            
            const params = new URLSearchParams({
                session_token: token,
                exchange: 'NASDAQ',
                token: symbol,
                interval: interval,
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
            showToast(String(error.message || error), 'error');
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
        
        const chartData = data.candles.map(c => ({ 
            time: c.unix_timestamp, 
            open: c.open, 
            high: c.high, 
            low: c.low, 
            close: c.close 
        }));
        
        const volumeData = data.candles.map(c => ({ 
            time: c.unix_timestamp, 
            value: c.volume || 0, 
            color: c.close >= c.open ? '#10b98180' : '#ef444480' 
        }));

        this.store.set('chartData', chartData);
        this.store.set('volumeData', volumeData);
        this.store.set('dataRequestId', data.request_id);
        this.store.set('allDataLoaded', !data.is_partial);
        
        console.log(`Processed ${chartData.length} candles for ${this.store.get('selectedSymbol')}`);
    }

    // Enhanced method for fetching next chunk of data with better error handling
    async fetchNextChunk() {
        const requestId = this.store.get('dataRequestId');
        const candleType = this.store.get('selectedCandleType');
        const interval = this.store.get('selectedInterval');
        
        if (!requestId || this.isPaginating || this.store.get('allDataLoaded')) return;

        this.isPaginating = true;
        
        try {
            // Determine chunk endpoint based on data type
            let endpoint = 'historical/chunk';
            if (interval.includes('tick')) {
                endpoint = 'tick/chunk';
            } else if (candleType === 'heikin_ashi') {
                endpoint = 'heikin-ashi/chunk';
            }
            
            const params = new URLSearchParams({
                request_id: requestId,
                offset: 0, // Not used in cursor-based pagination
                limit: 5000
            });

            const url = `${API_BASE_URL}/${endpoint}?${params.toString()}`;
            const res = await fetch(url);
            
            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(`Chunk fetch failed: ${errorBody.detail}`);
            }
            
            const data = await res.json();
            
            if (data.candles && data.candles.length > 0) {
                this.appendChunkData(data);
            } else {
                this.store.set('allDataLoaded', true);
                console.log('No more data available');
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

    // Public method to manually refresh data
    async refreshData() {
        if (this.isFetching) {
            showToast('Data is already loading...', 'info');
            return;
        }
        
        await this.loadInitialChartData();
    }

    // Get current data status
    getDataStatus() {
        return {
            isLoading: this.store.get('isLoading'),
            dataCount: this.store.get('chartData')?.length || 0,
            allDataLoaded: this.store.get('allDataLoaded'),
            hasRequestId: !!this.store.get('dataRequestId')
        };
    }
}

export const dataService = new DataService(store);