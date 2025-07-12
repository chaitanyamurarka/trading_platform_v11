// frontend_soa/src/services/session.service.js
import { store } from '../state/store.js';
import { showToast } from '../ui/helpers.js';

// Use dynamic API URL based on environment
const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8000`;

class SessionService {
    constructor(store) {
        this.store = store;
        this.heartbeatIntervalId = null;
        this.isHeartbeatActive = false;
    }

    async startSession() {
        try {
            console.log('Starting session with API:', API_BASE_URL);
            const res = await fetch(`${API_BASE_URL}/utils/session/initiate`);
            
            if (!res.ok) {
                throw new Error(`Session initiation failed: ${res.status} ${res.statusText}`);
            }
            
            const sessionData = await res.json();
            this.store.set('sessionToken', sessionData.session_token);
            showToast('Session started.', 'info');
            this.startHeartbeat();
            
            console.log('Session started successfully');
            return sessionData;
            
        } catch (error) {
            console.error('Failed to initiate session:', error);
            showToast('Could not start a session. Please check your connection.', 'error');
            throw error;
        }
    }
    
    async fetchSymbols() {
        try {
            console.log('Fetching symbols from API:', API_BASE_URL);
            const response = await fetch(`${API_BASE_URL}/symbols`);
            
            if (!response.ok) {
                throw new Error(`Symbols fetch failed: ${response.status} ${response.statusText}`);
            }
            
            const symbols = await response.json();
            this.store.set('availableSymbols', symbols);
            
            console.log(`Fetched ${symbols.length} symbols`);
            showToast(`Loaded ${symbols.length} symbols.`, 'success');
            
            return symbols;
            
        } catch (error) {
            console.error("Failed to fetch symbols:", error);
            showToast("Error loading symbols. Please check your connection.", 'error');
            return [];
        }
    }

    startHeartbeat() {
        if (this.heartbeatIntervalId) {
            clearInterval(this.heartbeatIntervalId);
        }
        
        this.isHeartbeatActive = true;
        this.heartbeatIntervalId = setInterval(async () => {
            const token = this.store.get('sessionToken');
            if (token && this.isHeartbeatActive) {
                try {
                    const response = await fetch(`${API_BASE_URL}/utils/session/heartbeat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ session_token: token }),
                    });
                    
                    if (!response.ok) {
                        console.warn('Heartbeat failed:', response.status, response.statusText);
                        // Optionally try to restart session
                        if (response.status === 401 || response.status === 403) {
                            console.log('Session expired, attempting to restart...');
                            await this.restartSession();
                        }
                    }
                } catch (error) {
                    console.error('Heartbeat failed:', error);
                }
            }
        }, 60000); // Every minute
        
        console.log('Heartbeat started');
    }

    async restartSession() {
        try {
            this.stopHeartbeat();
            await this.startSession();
            showToast('Session refreshed', 'info');
        } catch (error) {
            console.error('Failed to restart session:', error);
            showToast('Session restart failed. Please reload the page.', 'error');
        }
    }

    stopHeartbeat() {
        if (this.heartbeatIntervalId) {
            clearInterval(this.heartbeatIntervalId);
            this.heartbeatIntervalId = null;
        }
        this.isHeartbeatActive = false;
        console.log('Heartbeat stopped');
    }

    async endSession() {
        const token = this.store.get('sessionToken');
        if (token) {
            try {
                await fetch(`${API_BASE_URL}/utils/session/end`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_token: token }),
                });
            } catch (error) {
                console.error('Failed to end session gracefully:', error);
            }
        }
        
        this.stopHeartbeat();
        this.store.set('sessionToken', null);
        showToast('Session ended', 'info');
    }

    // Get session status
    getSessionStatus() {
        return {
            hasToken: !!this.store.get('sessionToken'),
            isHeartbeatActive: this.isHeartbeatActive,
            symbolsCount: this.store.get('availableSymbols')?.length || 0
        };
    }

    // Validate current session
    async validateSession() {
        const token = this.store.get('sessionToken');
        if (!token) return false;

        try {
            const response = await fetch(`${API_BASE_URL}/utils/session/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_token: token }),
            });
            
            return response.ok;
        } catch (error) {
            console.error('Session validation failed:', error);
            return false;
        }
    }
}

export const sessionService = new SessionService(store);