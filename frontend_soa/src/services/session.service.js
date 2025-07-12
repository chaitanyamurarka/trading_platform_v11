// frontend_soa/src/services/session.service.js
import { store } from '../state/store.js';
import { showToast } from '../ui/helpers.js';

const API_BASE_URL = `http://${window.location.hostname}:8000`;

class SessionService {
    constructor(store) {
        this.store = store;
        this.heartbeatIntervalId = null;
    }

    async startSession() {
        try {
            const res = await fetch(`${API_BASE_URL}/utils/session/initiate`);
            const sessionData = await res.json();
            this.store.set('sessionToken', sessionData.session_token);
            showToast('Session started.', 'info');
            this.startHeartbeat();
        } catch (error) {
            console.error('Failed to initiate session:', error);
            showToast('Could not start a session.', 'error');
        }
    }
    
    async fetchSymbols() {
        try {
            const response = await fetch(`${API_BASE_URL}/symbols`);
            const symbols = await response.json();
            this.store.set('availableSymbols', symbols);
            return symbols;
        } catch (error) {
            console.error("Failed to fetch symbols:", error);
            showToast("Error loading symbols.", 'error');
            return null;
        }
    }

    startHeartbeat() {
        if (this.heartbeatIntervalId) clearInterval(this.heartbeatIntervalId);
        this.heartbeatIntervalId = setInterval(() => {
            const token = this.store.get('sessionToken');
            if (token) {
                fetch(`${API_BASE_URL}/utils/session/heartbeat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_token: token }),
                }).catch(e => console.error('Heartbeat failed', e));
            }
        }, 60000);
    }
}

export const sessionService = new SessionService(store);