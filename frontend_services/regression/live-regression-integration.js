// frontend/src/services/live-regression-integration.js
import { state } from '../chart/state.js';
import { getDomElements } from '../main/dom-elements.js';
import { showToast } from '../chart/ui-helpers.js';
import { liveRegressionWebSocket } from '../regression/live-regression-websocket.js';

const elements = getDomElements();

/**
 * Main integration class for managing live regression functionality
 */
class LiveRegressionIntegration {
    constructor() {
        this.isInitialized = false;
        this.statusUpdateInterval = null;
        this.connectionHealthInterval = null;
        this.lastUpdateTime = null;
        this.latencyBuffer = [];
        this.maxLatencyBuffer = 10;
    }

    /**
     * Initialize the live regression integration
     */
    async initialize() {
        if (this.isInitialized) return;

        this.setupStatusMonitoring();
        this.setupConnectionHealthCheck();
        this.setupEventListeners();
        this.updateUI();

        this.isInitialized = true;
        console.log('Live Regression Integration initialized');
    }

    /**
     * Sets up status monitoring for live regression
     */
    setupStatusMonitoring() {
        // Update UI status every second
        this.statusUpdateInterval = setInterval(() => {
            this.updateConnectionStatus();
            this.updateLatencyDisplay();
        }, 1000);
    }

    /**
     * Sets up connection health monitoring
     */
    setupConnectionHealthCheck() {
        // Check connection health every 30 seconds
        this.connectionHealthInterval = setInterval(() => {
            this.checkConnectionHealth();
        }, 30000);
    }

    /**
     * Sets up event listeners for live regression events
     */
    setupEventListeners() {
        // Listen for live regression updates
        window.addEventListener('liveRegressionUpdate', (event) => {
            this.handleLiveUpdate(event.detail);
        });

        // Listen for connection status changes
        liveRegressionWebSocket.onConnectionChange = (status) => {
            this.handleConnectionChange(status);
        };

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.handlePageHidden();
            } else {
                this.handlePageVisible();
            }
        });

        // Setup control button listeners
        this.setupControlButtons();
    }

    /**
     * Sets up control button event listeners
     */
    setupControlButtons() {
        // Pause/Resume button
        const pauseBtn = document.getElementById('pause-live-regression');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                this.togglePause();
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refresh-regression');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshRegression();
            });
        }

        // Live regression toggle in modal
        const enableLiveToggle = document.getElementById('enable-live-regression');
        if (enableLiveToggle) {
            enableLiveToggle.addEventListener('change', (event) => {
                this.handleLiveRegressionToggle(event.target.checked);
            });
        }
    }

    /**
     * Handles live regression updates
     */
    handleLiveUpdate(data) {
        this.lastUpdateTime = new Date();
        
        // Calculate latency if timestamp is available
        if (data.timestamp) {
            const serverTime = new Date(data.timestamp);
            const latency = this.lastUpdateTime - serverTime;
            this.addLatencyMeasurement(latency);
        }

        // Update UI with visual feedback
        this.animateTableUpdate(data.timeframe);
        
        // Update status displays
        this.updateLastUpdateDisplay();
    }

    /**
     * Handles connection status changes
     */
    handleConnectionChange(status) {
        const { connected, symbol, error } = status;
        
        this.updateConnectionIndicator(connected);
        
        if (connected) {
            this.showLiveControls(true);
            showToast(`Live regression connected for ${symbol}`, 'success');
        } else {
            this.showLiveControls(false);
            if (error) {
                showToast(`Live regression disconnected: ${error}`, 'warning');
            }
        }
    }

    /**
     * Updates the connection status display
     */
    updateConnectionStatus() {
        const statusElement = document.getElementById('live-regression-status');
        const connectionElement = document.getElementById('regression-connection-status');
        
        if (!statusElement || !connectionElement) return;

        const isConnected = liveRegressionWebSocket.isConnectionOpen();
        
        if (isConnected) {
            statusElement.classList.remove('hidden');
            connectionElement.classList.remove('hidden');
        } else {
            statusElement.classList.add('hidden');
            connectionElement.classList.add('hidden');
        }
    }

    /**
     * Updates the latency display
     */
    updateLatencyDisplay() {
        const latencyElement = document.getElementById('data-latency');
        if (!latencyElement) return;

        if (this.latencyBuffer.length > 0) {
            const avgLatency = this.latencyBuffer.reduce((a, b) => a + b, 0) / this.latencyBuffer.length;
            latencyElement.textContent = `Latency: ${Math.round(avgLatency)}ms`;
            
            // Color code the latency
            if (avgLatency < 100) {
                latencyElement.className = 'badge badge-success badge-xs';
            } else if (avgLatency < 500) {
                latencyElement.className = 'badge badge-warning badge-xs';
            } else {
                latencyElement.className = 'badge badge-error badge-xs';
            }
        } else {
            latencyElement.textContent = 'Latency: --ms';
            latencyElement.className = 'badge badge-outline badge-xs';
        }
    }

    /**
     * Updates the last update time display
     */
    updateLastUpdateDisplay() {
        const updateElement = document.getElementById('regression-last-update');
        if (!updateElement || !this.lastUpdateTime) return;

        const timeAgo = Math.floor((new Date() - this.lastUpdateTime) / 1000);
        
        if (timeAgo < 60) {
            updateElement.textContent = `Updated ${timeAgo}s ago`;
        } else if (timeAgo < 3600) {
            updateElement.textContent = `Updated ${Math.floor(timeAgo / 60)}m ago`;
        } else {
            updateElement.textContent = `Updated ${Math.floor(timeAgo / 3600)}h ago`;
        }
    }

    /**
     * Adds a latency measurement to the buffer
     */
    addLatencyMeasurement(latency) {
        this.latencyBuffer.push(latency);
        if (this.latencyBuffer.length > this.maxLatencyBuffer) {
            this.latencyBuffer.shift();
        }
    }

    /**
     * Animates table updates for visual feedback
     */
    animateTableUpdate(timeframe) {
        if (!elements.regressionTableBody) return;

        // Find the row for this timeframe and animate it
        const rows = elements.regressionTableBody.querySelectorAll('tr');
        for (const row of rows) {
            const timeframeCell = row.cells[1];
            if (timeframeCell && timeframeCell.textContent === timeframe) {
                row.classList.add('live-regression-update');
                setTimeout(() => {
                    row.classList.remove('live-regression-update');
                }, 300);
                break;
            }
        }
    }

    /**
     * Updates the connection indicator
     */
    updateConnectionIndicator(connected) {
        const statusElement = document.getElementById('live-regression-status');
        if (!statusElement) return;

        if (connected) {
            statusElement.classList.remove('hidden');
            statusElement.innerHTML = `
                <span class="badge badge-success badge-sm">
                    <span class="animate-pulse w-2 h-2 bg-green-300 rounded-full inline-block mr-1"></span>
                    LIVE
                </span>
            `;
        } else {
            statusElement.classList.add('hidden');
        }
    }

    /**
     * Shows or hides live control elements
     */
    showLiveControls(show) {
        const controlsElement = document.getElementById('live-regression-controls');
        if (!controlsElement) return;

        if (show) {
            controlsElement.classList.remove('hidden');
        } else {
            controlsElement.classList.add('hidden');
        }
    }

    /**
     * Checks connection health and reconnects if necessary
     */
    checkConnectionHealth() {
        if (!liveRegressionWebSocket.isConnectionOpen() && state.isIndicatorActive && elements.liveToggle.checked) {
            console.log('Connection health check: attempting to reconnect live regression');
            // Attempt to reconnect if we should be connected but aren't
            this.reconnectIfNeeded();
        }
    }

    /**
     * Attempts to reconnect if conditions are met
     */
    async reconnectIfNeeded() {
        if (!state.isIndicatorActive || !elements.liveToggle.checked) return;

        try {
            const settings = {
                symbol: elements.symbolSelect.value,
                exchange: elements.exchangeSelect.value,
                timeframes: state.regressionSettings.timeframes,
                timezone: elements.timezoneSelect.value,
                regressionLength: state.regressionSettings.length,
                lookbackPeriods: state.regressionSettings.lookbackPeriods
            };

            await liveRegressionWebSocket.connect(settings);
        } catch (error) {
            console.error('Failed to reconnect live regression:', error);
        }
    }

    /**
     * Handles page becoming hidden
     */
    handlePageHidden() {
        // Reduce update frequency when page is hidden to save resources
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
            this.statusUpdateInterval = setInterval(() => {
                this.updateConnectionStatus();
            }, 5000); // Update every 5 seconds instead of 1
        }
    }

    /**
     * Handles page becoming visible
     */
    handlePageVisible() {
        // Resume normal update frequency when page becomes visible
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
            this.statusUpdateInterval = setInterval(() => {
                this.updateConnectionStatus();
                this.updateLatencyDisplay();
            }, 1000);
        }

        // Check if we need to reconnect
        this.reconnectIfNeeded();
    }

    /**
     * Toggles pause/resume for live updates
     */
    togglePause() {
        const pauseBtn = document.getElementById('pause-live-regression');
        if (!pauseBtn) return;

        const isPaused = pauseBtn.classList.contains('btn-active');
        
        if (isPaused) {
            // Resume
            liveRegressionWebSocket.resume();
            pauseBtn.classList.remove('btn-active');
            pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            pauseBtn.title = 'Pause Live Updates';
            showToast('Live regression resumed', 'info');
        } else {
            // Pause
            liveRegressionWebSocket.pause();
            pauseBtn.classList.add('btn-active');
            pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            pauseBtn.title = 'Resume Live Updates';
            showToast('Live regression paused', 'info');
        }
    }

    /**
     * Manually refreshes regression data
     */
    refreshRegression() {
        if (!state.isIndicatorActive) {
            showToast('No active regression to refresh', 'warning');
            return;
        }

        // Trigger a manual refresh by sending a heartbeat
        if (liveRegressionWebSocket.isConnectionOpen()) {
            liveRegressionWebSocket.sendHeartbeat();
            showToast('Regression refresh requested', 'info');
        } else {
            showToast('Not connected to live regression', 'error');
        }
    }

    /**
     * Handles the live regression toggle in the modal
     */
    handleLiveRegressionToggle(enabled) {
        const liveToggle = elements.liveToggle;
        
        if (enabled && (!liveToggle || !liveToggle.checked)) {
            showToast('Live Mode must be enabled for live regression updates', 'warning');
            // Reset the toggle
            const enableLiveToggle = document.getElementById('enable-live-regression');
            if (enableLiveToggle) {
                enableLiveToggle.checked = false;
            }
            return;
        }

        if (enabled) {
            showToast('Live regression will be enabled when analysis is applied', 'info');
        } else {
            showToast('Live regression will be disabled', 'info');
        }
    }

    /**
     * Updates the entire UI state
     */
    updateUI() {
        this.updateConnectionStatus();
        this.updateLatencyDisplay();
        this.updateLastUpdateDisplay();
        
        const isConnected = liveRegressionWebSocket.isConnectionOpen();
        this.updateConnectionIndicator(isConnected);
        this.showLiveControls(isConnected);
    }

    /**
     * Cleans up the integration
     */
    destroy() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }
        
        if (this.connectionHealthInterval) {
            clearInterval(this.connectionHealthInterval);
        }

        this.isInitialized = false;
        console.log('Live Regression Integration destroyed');
    }

    /**
     * Gets the current status of live regression
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            connected: liveRegressionWebSocket.isConnectionOpen(),
            lastUpdate: this.lastUpdateTime,
            averageLatency: this.latencyBuffer.length > 0 
                ? this.latencyBuffer.reduce((a, b) => a + b, 0) / this.latencyBuffer.length 
                : null,
            settings: liveRegressionWebSocket.subscriptionSettings
        };
    }
}

// Create singleton instance
export const liveRegressionIntegration = new LiveRegressionIntegration();

// Export initialization function
export async function initializeLiveRegression() {
    await liveRegressionIntegration.initialize();
}

// Export status function
export function getLiveRegressionIntegrationStatus() {
    return liveRegressionIntegration.getStatus();
}

// Export cleanup function
export function destroyLiveRegression() {
    liveRegressionIntegration.destroy();
}