// frontend/static/js/app/10-session-manager.js
import { initiateSession, sendHeartbeat } from './api.js';
import { state } from '../utils/state.js';
import { showToast } from '../utils/ui-helpers.js';
import { fetchAndPopulateSymbols } from './api-service.js';

// Accept state and elements as arguments for session management
export async function startSession(stateObj, elementsObj) {
    const stateRef = stateObj || state;
    const elementsRef = elementsObj || getDomElements();
    try {
        const sessionData = await initiateSession();
        stateRef.sessionToken = sessionData.session_token;
        showToast('Session started.', 'info');

        // Fetch symbols and load chart data now that we have a session token.
        await fetchAndPopulateSymbols(stateRef, elementsRef);

        // Start heartbeat to keep the session alive
        if (stateRef.heartbeatIntervalId) clearInterval(stateRef.heartbeatIntervalId);
        stateRef.heartbeatIntervalId = setInterval(() => {
            if (stateRef.sessionToken) {
                sendHeartbeat(stateRef.sessionToken).catch(e => console.error('Heartbeat failed', e));
            }
        }, 60000); // every minute

    } catch (error) {
        console.error('Failed to initiate session:', error);
        showToast('Could not start a session. Please reload.', 'error');
    }
}