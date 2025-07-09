// frontend/src/services/live-regression-websocket.js
import { state } from '../utils/state.js';
import { getDomElements } from '../utils/dom-elements.js';
import { showToast } from '../utils/ui-helpers.js';

const elements = getDomElements();

class LiveRegressionWebSocketService {
    constructor() {
        this.websocket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.subscriptionSettings = null;
        this.messageBuffer = [];
        this.isBuffering = false;
    }

    /**
     * Connects to the live regression WebSocket endpoint
     * @param {Object} settings - Regression subscription settings
     * @param {string} settings.symbol - Trading symbol
     * @param {string} settings.exchange - Exchange name
     * @param {Array<string>} settings.timeframes - List of timeframes
     * @param {string} settings.timezone - Timezone for calculations
     * @param {number} settings.regressionLength - Number of candles for regression
     * @param {Array<number>} settings.lookbackPeriods - List of lookback periods
     */
    async connect(settings) {
        if (this.websocket && this.isConnected) {
            await this.disconnect();
        }

        this.subscriptionSettings = settings;
        
        try {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            
            // FIXED: Properly encode the symbol to handle special characters like @NQ#
            const encodedSymbol = encodeURIComponent(settings.symbol);
            const encodedExchange = encodeURIComponent(settings.exchange);
            
            // FIXED: Properly encode query parameters
            const queryParams = new URLSearchParams({
                timeframes: settings.timeframes.join(','),
                timezone: settings.timezone,
                regression_length: settings.regressionLength.toString(),
                lookback_periods: settings.lookbackPeriods.join(',')
            });
            
            const wsURL = `${wsProtocol}//${window.location.host}/ws/live-regression/${encodedSymbol}/${encodedExchange}?${queryParams.toString()}`;

            console.log('Connecting to live regression WebSocket:', wsURL);
            console.log('Original symbol:', settings.symbol, 'Encoded symbol:', encodedSymbol);
            
            this.websocket = new WebSocket(wsURL);
            this.setupEventHandlers();
            
            showToast(`Connecting to live regression for ${settings.symbol}...`, 'info');
            
        } catch (error) {
            console.error('Error connecting to live regression WebSocket:', error);
            showToast('Failed to connect to live regression service', 'error');
        }
    }

    setupEventHandlers() {
        if (!this.websocket) return;

        this.websocket.onopen = () => {
            console.log('Live regression WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            showToast(`Live regression connected for ${this.subscriptionSettings.symbol}!`, 'success');
            
            // Process any buffered messages
            this.processMessageBuffer();
        };

        this.websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (this.isBuffering) {
                    this.messageBuffer.push(data);
                    return;
                }
                
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parsing live regression message:', error);
            }
        };

        this.websocket.onclose = (event) => {
            console.log('Live regression WebSocket closed:', event.code, event.reason);
            this.isConnected = false;
            
            if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.attemptReconnect();
            } else {
                showToast('Live regression connection closed', 'info');
            }
        };

        this.websocket.onerror = (error) => {
            console.error('Live regression WebSocket error:', error);
            showToast('Live regression connection error', 'error');
        };
    }

    handleMessage(data) {
        switch (data.type) {
            case 'subscription_confirmed':
                this.handleSubscriptionConfirmed(data);
                break;
            case 'live_regression_update':
                this.handleRegressionUpdate(data);
                break;
            case 'error':
                this.handleError(data);
                break;
            case 'heartbeat':
                // Echo heartbeat back to server
                this.sendHeartbeat();
                break;
            default:
                console.log('Unknown live regression message type:', data.type);
        }
    }

    handleSubscriptionConfirmed(data) {
        console.log('Live regression subscription confirmed:', data);
        showToast(`Live regression active for ${data.symbol} (${data.timeframes.length} timeframes)`, 'success');
        
        // Update UI to show live regression is active
        this.updateRegressionTableWithLiveIndicator(true);
    }

    handleRegressionUpdate(data) {
        console.log('Live regression update received:', data);
        
        // Update the regression table with new live data
        this.updateLiveRegressionTable(data);
        
        // Trigger custom event for other components that might be interested
        window.dispatchEvent(new CustomEvent('liveRegressionUpdate', {
            detail: data
        }));
    }

    handleError(data) {
        console.error('Live regression error:', data.message);
        showToast(`Live regression error: ${data.message}`, 'error');
    }

    updateLiveRegressionTable(data) {
        // This function updates the existing regression table with live data
        // It finds the row for the specific timeframe and updates the values
        
        const { symbol, timeframe, results, timestamp } = data;
        
        if (!elements.regressionTableBody) return;
        
        // Find the row for this timeframe
        const rows = elements.regressionTableBody.querySelectorAll('tr');
        let targetRow = null;
        
        for (const row of rows) {
            const timeframeCell = row.cells[1]; // Timeframe is in the second column
            if (timeframeCell && timeframeCell.textContent === timeframe) {
                targetRow = row;
                break;
            }
        }
        
        if (!targetRow) {
            console.warn(`No table row found for timeframe: ${timeframe}`);
            return;
        }
        
        // Update the slope values with live data
        let totalRValue = 0;
        let rValueCount = 0;
        
        // Start from column 2 (skip Sr. No. and Timeframe)
        let cellIndex = 2;
        
        this.subscriptionSettings.lookbackPeriods.forEach(period => {
            const cell = targetRow.cells[cellIndex];
            if (cell && results[period.toString()]) {
                const result = results[period.toString()];
                cell.textContent = result.slope.toFixed(5);
                cell.className = result.slope > 0 ? 'text-success font-bold' : 'text-error font-bold';
                
                // Add live indicator
                cell.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
                
                totalRValue += Math.abs(result.r_value);
                rValueCount++;
            }
            cellIndex++;
        });
        
        // Update average R-Value
        const rValueCell = targetRow.cells[cellIndex];
        if (rValueCell && rValueCount > 0) {
            const avgRValue = totalRValue / rValueCount;
            rValueCell.textContent = avgRValue.toFixed(4);
            rValueCell.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
        }
        
        // Add timestamp indicator
        targetRow.setAttribute('data-last-update', timestamp);
        targetRow.style.borderLeft = '3px solid #22c55e';
    }

    updateRegressionTableWithLiveIndicator(isLive) {
        if (!elements.regressionTableContainer) return;
        
        // Add or remove live indicator to the table header
        const header = elements.regressionTableContainer.querySelector('h3');
        if (header) {
            if (isLive) {
                header.innerHTML = 'Linear Regression Analysis <span class="badge badge-success badge-sm ml-2">LIVE</span>';
            } else {
                header.innerHTML = 'Linear Regression Analysis';
            }
        }
    }

    sendHeartbeat() {
        if (this.websocket && this.isConnected) {
            this.websocket.send(JSON.stringify({
                type: 'heartbeat',
                timestamp: new Date().toISOString()
            }));
        }
    }

    startBuffering() {
        this.isBuffering = true;
        this.messageBuffer = [];
    }

    processMessageBuffer() {
        if (this.messageBuffer.length > 0) {
            console.log(`Processing ${this.messageBuffer.length} buffered live regression messages`);
            this.messageBuffer.forEach(message => this.handleMessage(message));
            this.messageBuffer = [];
        }
        this.isBuffering = false;
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            showToast('Max reconnection attempts reached for live regression', 'error');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
        
        console.log(`Attempting to reconnect live regression (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
        
        setTimeout(() => {
            if (this.subscriptionSettings) {
                this.connect(this.subscriptionSettings);
            }
        }, delay);
    }

    async disconnect() {
        if (this.websocket) {
            this.isConnected = false;
            this.websocket.onclose = null; // Prevent reconnection attempts
            this.websocket.close(1000, 'User initiated disconnect');
            this.websocket = null;
        }
        
        // Update UI to show live regression is inactive
        this.updateRegressionTableWithLiveIndicator(false);
        
        // Clear live styling from table
        this.clearLiveTableStyling();
        
        console.log('Live regression WebSocket disconnected');
    }

    clearLiveTableStyling() {
        if (!elements.regressionTableBody) return;
        
        const rows = elements.regressionTableBody.querySelectorAll('tr');
        rows.forEach(row => {
            row.style.borderLeft = '';
            const cells = row.querySelectorAll('td');
            cells.forEach(cell => {
                cell.style.backgroundColor = '';
                cell.classList.remove('font-bold');
            });
        });
    }

    isConnectionOpen() {
        return this.websocket && this.isConnected;
    }

    getConnectionStatus() {
        return {
            connected: this.isConnected,
            settings: this.subscriptionSettings,
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

// Export singleton instance
export const liveRegressionWebSocket = new LiveRegressionWebSocketService();

// Export helper functions
export function connectToLiveRegression(settings) {
    return liveRegressionWebSocket.connect(settings);
}

export function disconnectFromLiveRegression() {
    return liveRegressionWebSocket.disconnect();
}

export function isLiveRegressionConnected() {
    return liveRegressionWebSocket.isConnectionOpen();
}

export function getLiveRegressionStatus() {
    return liveRegressionWebSocket.getConnectionStatus();
}