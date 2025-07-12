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

            // For live updates, it's often more performant to update the chart directly
            // rather than going through the store for every single price tick.
            if (data.completed_bar) {
                chartController.updateBar(data.completed_bar);
            }
            if (data.current_bar) {
                chartController.updateBar(data.current_bar);
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