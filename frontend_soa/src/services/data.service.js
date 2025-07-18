// frontend_soa/src/services/data.service.js - Updated to always include timestamps
import { store } from '../state/store.js';
import { showToast } from '../ui/helpers.js';
import { websocketService } from './websocket.service.js';
import { setAutomaticDateTime } from '../ui/helpers.js';
import { indicatorService } from './indicator.service.js';

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
        this.store.subscribe('selectedInterval', (newInterval) => {
            this.loadInitialChartData();
            // Update visualization timeframe if regression is active
            this.updateRegressionVisualization(newInterval);
        });
        this.store.subscribe('selectedTimezone', () => this.loadInitialChartData());
        this.store.subscribe('selectedCandleType', () => this.loadInitialChartData());
        this.store.subscribe('startTime', () => this.loadInitialChartData());
        this.store.subscribe('endTime', () => this.loadInitialChartData());
        this.store.subscribe('isLiveMode', (isLive) => this.handleLiveMode(isLive));
        
        console.log('DataService Initialized');
    }

    updateRegressionVisualization(newInterval) {
        // Update regression visualization when timeframe changes
        const isIndicatorActive = this.store.get('isIndicatorActive');
        if (isIndicatorActive) {
            // Dynamic import to avoid circular dependency
            import('./indicator.service.js').then(({ indicatorService }) => {
                indicatorService.updateVisualizationTimeframe(newInterval);
            });
        }
    }

    handleLiveMode(isLive) {
        if (isLive) {
            console.log('🔴 Live mode enabled - setting up connection');
            // Ensure we have timestamps when enabling live mode
            this.ensureTimestamps();
            
            // Load initial data first, then connect WebSocket
            this.loadInitialChartData().then(() => {
                // Only connect WebSocket after data is loaded
                this.connectWebSocket();
            });
        } else {
            console.log('🔴 Live mode disabled - disconnecting');
            websocketService.disconnect();
            showToast('Live mode disabled', 'info');
        }
    }

    ensureTimestamps() {
        const startTime = this.store.get('startTime');
        const endTime = this.store.get('endTime');
        
        if (!startTime || !endTime) {
            console.log('📅 Setting automatic timestamps');
            setAutomaticDateTime();
        }
    }

    connectWebSocket() {
        const params = {
            symbol: this.store.get('selectedSymbol'),
            interval: this.store.get('selectedInterval'),
            timezone: this.store.get('selectedTimezone'),
            candleType: this.store.get('selectedCandleType'),
            // Include timestamps for consistency
            startTime: this.store.get('startTime'),
            endTime: this.store.get('endTime')
        };
        
        console.log('🔌 Connecting WebSocket with params:', params);
        websocketService.connect(params);
        
        // Trigger auto-scaling when live mode is enabled
        import('../ui/components/drawingToolbar.js').then(({ drawingToolbar }) => {
            drawingToolbar.triggerAutoScaling();
        });
    }

    async loadInitialChartData() {
        const token = this.store.get('sessionToken');
        const symbol = this.store.get('selectedSymbol');
        
        if (!token || !symbol || this.isFetching) return;
        
        // Ensure timestamps are always present
        this.ensureTimestamps();
        
        const startTime = this.store.get('startTime');
        const endTime = this.store.get('endTime');
        
        if (!startTime || !endTime) {
            console.error('Failed to set timestamps for chart data load');
            showToast('Error: Unable to determine time range', 'error');
            return;
        }

        websocketService.disconnect();
        indicatorService.removeRegressionAnalysis();
        
        this.isFetching = true;
        this.store.set('isLoading', true);

        // Reset chart data arrays
        this.store.set('chartData', []);
        this.store.set('volumeData', []);
        this.store.set('dataRequestId', null);
        this.store.set('allDataLoaded', false);
        
        websocketService.setLoadingState(true);
        
        // Reset all data arrays before loading new data
        this.resetAllData();
        
        // Inform websocket service that we're loading historical data
        websocketService.setLoadingState(true);

        try {
            const candleType = this.store.get('selectedCandleType');
            const interval = this.store.get('selectedInterval');
            const timezone = this.store.get('selectedTimezone');
            
            // Determine endpoint based on candle type and interval
            let endpoint = 'historical';
            if (interval.includes('tick')) {
                endpoint = 'tick';
                this.store.set('candleType', 'tick');
            } else if (candleType === 'heikin_ashi') {
                endpoint = 'heikin-ashi';
                this.store.set('candleType', 'heikin_ashi');
            } else {
                this.store.set('candleType', 'regular');
            }
            
            const params = new URLSearchParams({
                session_token: token,
                exchange: this.store.get('selectedExchange'),
                token: symbol,
                interval: interval,
                start_time: startTime,
                end_time: endTime,
                timezone: timezone,
                // Include timestamp in request for server-side consistency
                request_timestamp: new Date().toISOString()
            });

            const url = `${API_BASE_URL}/${endpoint}/?${params.toString()}`;
            console.log(`📊 Fetching data from: ${url}`);
            console.log(`📅 Time range: ${startTime} to ${endTime} (${timezone})`);

            const res = await fetch(url);
            
            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(`Server responded with ${res.status}: ${errorBody.detail}`);
            }
            
            const data = await res.json();
            
            // Validate that we received data with timestamps
            if (data.candles && data.candles.length > 0) {
                const firstCandle = data.candles[0];
                const lastCandle = data.candles[data.candles.length - 1];
                console.log(`📊 Received ${data.candles.length} candles`);
                console.log(`📅 Data range: ${new Date(firstCandle.unix_timestamp * 1000).toISOString()} to ${new Date(lastCandle.unix_timestamp * 1000).toISOString()}`);
            }
            
            this.processAndStoreData(data, endpoint);
            showToast(data.message || 'Data loaded successfully', 'success');

        } catch (error) {
            console.error("Failed to load chart data:", error);
            showToast(String(error.message || error), 'error');
            this.store.set('chartData', []);
            this.store.set('volumeData', []);
        } finally {
            this.isFetching = false;
            this.store.set('isLoading', false);
            
            websocketService.setLoadingState(false);

            // Re-connect if in live mode
            if (this.store.get('isLiveMode')) {
                this.connectWebSocket();
            }

            // Apply autoscaling after loading data
            import('../ui/components/drawingToolbar.js').then(({ drawingToolbar }) => {
                drawingToolbar.triggerAutoScaling();
            });
        }
    }

    resetAllData() {
        // Reset all data states
        this.store.set('chartData', []);
        this.store.set('volumeData', []);
        this.store.set('dataRequestId', null);
        this.store.set('allDataLoaded', false);
        
        // Additional states for different candle types
        this.store.set('chartRequestId', null);
        this.store.set('heikinAshiRequestId', null);
        this.store.set('tickRequestId', null);
        
        console.log("All chart data states have been reset.");
    }

    processAndStoreData(data, dataType) {
        if (!data || !Array.isArray(data.candles)) {
            console.error("Invalid data structure received from server:", data);
            return;
        }
        
        const chartData = data.candles.map(c => ({ 
            time: c.unix_timestamp, 
            open: c.open, 
            high: c.high, 
            low: c.low, 
            close: c.close,
            // Include original timestamp for reference
            originalTimestamp: c.timestamp
        }));
        
        const volumeData = data.candles.map(c => ({ 
            time: c.unix_timestamp, 
            value: c.volume || 0, 
            color: c.close >= c.open ? '#10b98180' : '#ef444480' 
        }));

        // Store the appropriate request ID based on data type
        switch (dataType) {
            case 'tick':
                this.store.set('tickRequestId', data.request_id);
                break;
            case 'heikin-ashi':
                this.store.set('heikinAshiRequestId', data.request_id);
                break;
            default:
                this.store.set('chartRequestId', data.request_id);
                break;
        }

        this.store.set('chartData', chartData);
        this.store.set('volumeData', volumeData);
        this.store.set('dataRequestId', data.request_id);
        this.store.set('allDataLoaded', !data.is_partial);
        
        // Store metadata about the data
        this.store.set('dataMetadata', {
            symbol: this.store.get('selectedSymbol'),
            interval: this.store.get('selectedInterval'),
            timezone: this.store.get('selectedTimezone'),
            startTime: this.store.get('startTime'),
            endTime: this.store.get('endTime'),
            dataType: dataType,
            candleCount: chartData.length,
            lastUpdate: new Date().toISOString()
        });
        
        console.log(`✅ Processed ${chartData.length} candles for ${this.store.get('selectedSymbol')}`);
    }

    async fetchNextChunk() {
        const candleType = this.store.get('candleType');
        const interval = this.store.get('selectedInterval');
        
        // Get the appropriate request ID
        let requestId;
        if (interval.includes('tick')) {
            requestId = this.store.get('tickRequestId');
        } else if (candleType === 'heikin_ashi') {
            requestId = this.store.get('heikinAshiRequestId');
        } else {
            requestId = this.store.get('chartRequestId');
        }
        
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
                limit: 5000,
                // Include timestamp for consistency
                request_timestamp: new Date().toISOString()
            });

            const url = `${API_BASE_URL}/${endpoint}?${params.toString()}`;
            console.log(`📊 Fetching next chunk from: ${url}`);
            
            const res = await fetch(url);
            
            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(`Chunk fetch failed: ${errorBody.detail}`);
            }
            
            const data = await res.json();
            
            if (data.candles && data.candles.length > 0) {
                console.log(`📊 Received ${data.candles.length} additional candles`);
                this.appendChunkData(data, candleType);
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

    appendChunkData(data, dataType) {
        const newChartData = data.candles.map(c => ({ 
            time: c.unix_timestamp, 
            open: c.open, 
            high: c.high, 
            low: c.low, 
            close: c.close,
            originalTimestamp: c.timestamp
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
        
        // Update the appropriate request ID
        const interval = this.store.get('selectedInterval');
        if (interval.includes('tick')) {
            this.store.set('tickRequestId', data.request_id);
        } else if (dataType === 'heikin_ashi') {
            this.store.set('heikinAshiRequestId', data.request_id);
        } else {
            this.store.set('chartRequestId', data.request_id);
        }
        
        this.store.set('dataRequestId', data.request_id);
        this.store.set('allDataLoaded', !data.is_partial);
        
        // Update metadata
        const metadata = this.store.get('dataMetadata') || {};
        metadata.candleCount = (existingChartData.length + newChartData.length);
        metadata.lastUpdate = new Date().toISOString();
        this.store.set('dataMetadata', metadata);
        
        showToast(`Loaded ${data.candles.length} more candles`, 'success');
    }

    // Get current data status including timestamp information
    getDataStatus() {
        const metadata = this.store.get('dataMetadata');
        const chartData = this.store.get('chartData');
        
        return {
            hasData: chartData && chartData.length > 0,
            candleCount: chartData ? chartData.length : 0,
            metadata: metadata,
            isLoading: this.store.get('isLoading'),
            isPaginating: this.isPaginating,
            allDataLoaded: this.store.get('allDataLoaded'),
            timestamps: {
                start: this.store.get('startTime'),
                end: this.store.get('endTime'),
                timezone: this.store.get('selectedTimezone')
            }
        };
    }
}

export const dataService = new DataService(store);