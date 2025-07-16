// frontend_soa/src/services/websocket.service.js - FIXED VERSION
import { store } from '../state/store.js';
import { chartController } from '../chart/chart.controller.js';
import { showToast } from '../ui/helpers.js';

class WebSocketService {
    constructor() {
        this.socket = null;
        this.connectionParams = null;
        this.isLoadingHistoricalData = false;
        this.websocketMessageBuffer = [];
        this.connectionAttempt = 0;
    }

    connect(params) {
        // Prevent multiple connection attempts
        if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
            console.warn("⚠️ WebSocket connection attempt already in progress.");
            return;
        }

        this.disconnect(); // Ensure any old connection is closed
        this.connectionParams = params;
        this.connectionAttempt++;
        
        const { symbol, interval, timezone, candleType } = params;
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        
        const endpoint = candleType === 'heikin_ashi' ? 'ws-ha/live' : 'ws/live';
        const wsURL = `${wsProtocol}//${window.location.hostname}:8000/${endpoint}/${encodeURIComponent(symbol)}/${interval}/${encodeURIComponent(timezone)}`;

        console.log(`🔌 [Attempt #${this.connectionAttempt}] Connecting to WebSocket: ${wsURL}`);
        showToast(`Connecting to live feed for ${symbol}...`, 'info');
        
        this.socket = new WebSocket(wsURL);
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.socket.onopen = () => {
            console.log('✅ WebSocket connected successfully');
            showToast(`Live feed connected for ${this.connectionParams.symbol}!`, 'success');
        };

        this.socket.onmessage = (event) => {
            // Buffer messages if loading historical data
            if (this.isLoadingHistoricalData) {
                console.log("📦 Buffering WebSocket message during historical data load.");
                this.websocketMessageBuffer.push({ 
                    type: this.connectionParams.candleType, 
                    data: event.data 
                });
                return;
            }
            
            // Process message immediately
            this.handleMessage(event.data);
        };

        this.socket.onclose = (event) => {
            console.log('🔌 WebSocket connection closed:', event.code, event.reason);
            if (event.code !== 1000) { // 1000 = normal closure
                showToast('Live connection closed unexpectedly', 'warning');
            }
        };

        this.socket.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            showToast('Live connection error. Check console for details.', 'error');
        };
    }

    handleMessage(rawData) {
        try {
            const data = JSON.parse(rawData);
            
            // Handle backfill data (array)
            if (Array.isArray(data)) {
                this.handleBackfillData(data);
            } else {
                // Handle live updates (object)
                this.handleLiveUpdate(data);
            }
        } catch (error) {
            console.error('❌ Error parsing WebSocket message:', error);
        }
    }

    handleBackfillData(data) {
        if (data.length === 0) {
            console.log('📭 Received empty backfill data');
            return;
        }
        
        console.log(`📊 Received backfill data with ${data.length} bars.`);
        
        // Get current data arrays
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
            value: c.volume || 0, 
            color: c.close >= c.open ? '#10b98180' : '#ef444480' 
        }));
        
        // Only add bars that are newer than the last historical bar
        const lastHistoricalTime = targetOhlcArray.length > 0 ? 
            targetOhlcArray[targetOhlcArray.length - 1].time : 0;
        
        const newOhlcBars = formattedBackfillBars.filter(d => d.time > lastHistoricalTime);
        const newVolumeBars = formattedVolumeBars.filter(d => d.time > lastHistoricalTime);

        if (newOhlcBars.length > 0) {
            console.log(`📈 Adding ${newOhlcBars.length} new bars from backfill`);
            store.set('chartData', [...targetOhlcArray, ...newOhlcBars]);
            store.set('volumeData', [...targetVolumeArray, ...newVolumeBars]);
        }
    }

    handleLiveUpdate(data) {
        if (!data || !chartController.getMainSeries()) {
            console.warn('⚠️ Cannot handle live update: missing data or chart series');
            return;
        }

        const { completed_bar, current_bar } = data;

        // Update completed bar first
        if (completed_bar) {
            console.log('📊 Updating completed bar:', completed_bar.unix_timestamp);
            chartController.updateBar(completed_bar);
        }

        // Update current bar
        if (current_bar) {
            console.log('📊 Updating current bar:', current_bar.unix_timestamp);
            chartController.updateBar(current_bar);
        }
    }

    // Process buffered messages
    processMessageBuffer() {
        const bufferSize = this.websocketMessageBuffer.length;
        console.log(`📦 Processing ${bufferSize} buffered WebSocket messages.`);
        
        this.websocketMessageBuffer.forEach(msg => {
            try {
                this.handleMessage(msg.data);
            } catch (error) {
                console.error('❌ Error processing buffered message:', error);
            }
        });
        
        // Clear the buffer
        this.websocketMessageBuffer = [];
        
        if (bufferSize > 0) {
            console.log(`✅ Processed ${bufferSize} buffered messages`);
        }
    }

    // Set loading state
    setLoadingState(isLoading) {
        this.isLoadingHistoricalData = isLoading;
        console.log(`📊 Historical data loading state: ${isLoading}`);
        
        // Process buffer when loading completes
        if (!isLoading) {
            this.processMessageBuffer();
        }
    }

    disconnect() {
        if (this.socket) {
            console.log('🔌 Disconnecting WebSocket...');
            this.socket.onclose = null; // Prevent automatic reconnection
            this.socket.close(1000, 'User disconnected'); // 1000 = normal closure
            this.socket = null;
            console.log('✅ WebSocket disconnected');
        }
    }

    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    getConnectionState() {
        if (!this.socket) return 'DISCONNECTED';
        
        switch (this.socket.readyState) {
            case WebSocket.CONNECTING: return 'CONNECTING';
            case WebSocket.OPEN: return 'CONNECTED';
            case WebSocket.CLOSING: return 'CLOSING';
            case WebSocket.CLOSED: return 'DISCONNECTED';
            default: return 'UNKNOWN';
        }
    }

    // Debug method to check connection status
    getDebugInfo() {
        return {
            connectionState: this.getConnectionState(),
            isLoading: this.isLoadingHistoricalData,
            bufferSize: this.websocketMessageBuffer.length,
            connectionParams: this.connectionParams
        };
    }
}

export const websocketService = new WebSocketService();