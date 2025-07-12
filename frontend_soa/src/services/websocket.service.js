// frontend_soa/src/services/websocket.service.js
import { store } from '../state/store.js';
import { chartController } from '../chart/chart.controller.js';
import { showToast } from '../ui/helpers.js';

class WebSocketService {
    constructor() {
        this.socket = null;
        this.connectionParams = null;
    }

    connect(params) {
        this.disconnect(); // Ensure old connection is closed
        this.connectionParams = params;
        
        const { symbol, interval, timezone, candleType } = params;
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const endpoint = candleType === 'heikin_ashi' ? 'ws-ha/live' : 'ws/live';
        const wsURL = `${wsProtocol}//${window.location.hostname}:8000/${endpoint}/${encodeURIComponent(symbol)}/${interval}/${encodeURIComponent(timezone)}`;

        showToast(`Connecting to live feed for ${symbol}...`, 'info');
        this.socket = new WebSocket(wsURL);
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.socket.onopen = () => {
            showToast(`Live feed connected for ${this.connectionParams.symbol}!`, 'success');
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            // Handle backfill data (array)
            if (Array.isArray(data)) {
                if (data.length > 0) {
                    const chartData = data.map(c => ({ 
                        time: c.unix_timestamp, 
                        open: c.open, 
                        high: c.high, 
                        low: c.low, 
                        close: c.close 
                    }));
                    const volumeData = data.map(c => ({ 
                        time: c.unix_timestamp, 
                        value: c.volume || 0, 
                        color: c.close >= c.open ? '#10b98180' : '#ef444480' 
                    }));
                    
                    // Set initial data
                    chartController.mainSeries.setData(chartData);
                    chartController.volumeSeries.setData(volumeData);
                }
            } else {
                // Handle live updates
                if (data.completed_bar) {
                    chartController.updateBar(data.completed_bar);
                }
                if (data.current_bar) {
                    chartController.updateBar(data.current_bar);
                }
            }
        };

        this.socket.onclose = () => {
            console.log('Live data WebSocket closed.');
        };

        this.socket.onerror = (error) => {
            console.error('Live data WebSocket error:', error);
            showToast('Live connection error.', 'error');
        };
    }

    disconnect() {
        if (this.socket) {
            this.socket.onclose = null; // Prevent automatic reconnection logic if any
            this.socket.close();
            this.socket = null;
            console.log('WebSocket disconnected.');
        }
    }
}

export const websocketService = new WebSocketService();