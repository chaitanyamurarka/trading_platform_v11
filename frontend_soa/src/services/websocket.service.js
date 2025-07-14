// frontend_soa/src/services/websocket.service.js - Updated to match frontend_services logic
import { store } from '../state/store.js';
import { chartController } from '../chart/chart.controller.js';
import { showToast } from '../ui/helpers.js';

class WebSocketService {
    constructor() {
        this.socket = null;
        this.connectionParams = null;
        this.isLoadingHistoricalData = false;
        this.websocketMessageBuffer = [];
    }

    connect(params) {
        this.disconnect(); // Ensure old connection is closed
        this.connectionParams = params;
        
        const { symbol, interval, timezone, candleType } = params;
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const endpoint = candleType === 'heikin_ashi' ? 'ws-ha/live' : 'ws/live';
        const wsURL = `${wsProtocol}//${window.location.host}/${endpoint}/${encodeURIComponent(symbol)}/${interval}/${encodeURIComponent(timezone)}`;

        showToast(`Connecting to live feed for ${symbol}...`, 'info');
        this.socket = new WebSocket(wsURL);
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.socket.onopen = () => {
            showToast(`Live feed connected for ${this.connectionParams.symbol}!`, 'success');
        };

        this.socket.onmessage = (event) => {
            // Buffer messages if loading historical data
            if (this.isLoadingHistoricalData) {
                console.log("Buffering WebSocket message.");
                this.websocketMessageBuffer.push({ 
                    type: this.connectionParams.candleType, 
                    data: event.data 
                });
                return;
            }
            
            // Process message immediately
            this.handleMessage(event.data);
        };

        this.socket.onclose = () => {
            console.log('Live data WebSocket closed.');
        };

        this.socket.onerror = (error) => {
            console.error('Live data WebSocket error:', error);
            showToast('Live connection error.', 'error');
        };
    }

    handleMessage(rawData) {
        const data = JSON.parse(rawData);
        
        // Handle backfill data (array)
        if (Array.isArray(data)) {
            if (data.length === 0) return;
            console.log(`Received backfill data with ${data.length} bars.`);
            
            // Get current data arrays based on candle type
            const targetOhlcArray = store.get('chartData') || [];
            const targetVolumeArray = store.get('volumeData') || [];
            
            const formattedBackfillBars = data.map(c => ({ 
                time: c.unix_timestamp, 
                open: c.open, 
                high: c.high, 
                low: c.low, 
                close: c.close 
            }));
            
            const formattedVolumeBars = data.map(c => ({ 
                time: c.unix_timestamp, 
                value: c.volume, 
                color: c.close >= c.open ? '#10b98180' : '#ef444480' 
            }));
            
            const lastHistoricalTime = targetOhlcArray.length > 0 ? targetOhlcArray[targetOhlcArray.length - 1].time : 0;
            
            const newOhlcBars = formattedBackfillBars.filter(d => d.time > lastHistoricalTime);
            const newVolumeBars = formattedVolumeBars.filter(d => d.time > lastHistoricalTime);

            if (newOhlcBars.length > 0) {
                // Update store with new data
                store.set('chartData', [...targetOhlcArray, ...newOhlcBars]);
                store.set('volumeData', [...targetVolumeArray, ...newVolumeBars]);
            }
        } else {
            // Handle live updates
            this.handleLiveUpdate(data);
        }
    }

    handleLiveUpdate(data) {
        if (!data || !chartController.getMainSeries()) return;

        const { completed_bar, current_bar } = data;

        // Update completed bar first
        if (completed_bar) {
            chartController.updateBar(completed_bar);
        }

        // Update current bar
        if (current_bar) {
            chartController.updateBar(current_bar);
        }
    }

    // Process buffered messages
    processMessageBuffer() {
        console.log(`Processing ${this.websocketMessageBuffer.length} buffered WebSocket messages.`);
        
        this.websocketMessageBuffer.forEach(msg => {
            const parsedData = JSON.parse(msg.data);
            this.handleMessage(msg.data);
        });
        
        // Clear the buffer
        this.websocketMessageBuffer = [];
    }

    // Set loading state
    setLoadingState(isLoading) {
        this.isLoadingHistoricalData = isLoading;
        
        // Process buffer when loading completes
        if (!isLoading) {
            this.processMessageBuffer();
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.onclose = null; // Prevent automatic reconnection
            this.socket.close();
            this.socket = null;
            console.log('WebSocket disconnected.');
        }
    }

    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }
}

export const websocketService = new WebSocketService();