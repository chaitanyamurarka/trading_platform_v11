// frontend_soa/src/services/indicator.service.js
import { store } from '../state/store.js';
import { showToast } from '../ui/helpers.js';
import { liveIndicatorService } from './liveIndicator.service.js'; // Import the new service

const API_BASE_URL = `http://${window.location.hostname}:8000`;

class IndicatorService {
    constructor(store) {
        this.store = store;
    }

    initialize() {
        console.log('IndicatorService Initialized');
    }

    async runRegressionAnalysis(settings) { // 'enableLive' is now part of 'settings'
        this.store.set('isIndicatorLoading', true);
        this.store.set('isIndicatorActive', true);

        try {
            const requestBody = {
                symbol: this.store.get('selectedSymbol'),
                exchange: this.store.get('selectedExchange'),
                regression_length: settings.length,
                lookback_periods: settings.lookbackPeriods,
                timeframes: settings.timeframes,
            };

            const res = await fetch(`${API_BASE_URL}/regression`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!res.ok) throw new Error('Failed to fetch regression data');

            const results = await res.json();
            this.store.set('regressionResults', results);
            showToast('Regression analysis complete.', 'success');

            // Connect to live regression if enabled
            if (settings.enableLive && this.store.get('isLiveMode')) {
                liveIndicatorService.connect({
                    ...requestBody, 
                    regression_length: settings.length, 
                    lookback_periods: settings.lookbackPeriods
                });
            }

        } catch (error) {
            console.error('Failed to run regression analysis:', error);
            showToast(error.message, 'error');
            this.store.set('regressionResults', null);
        } finally {
            this.store.set('isIndicatorLoading', false);
        }
    }
    
    removeRegressionAnalysis() {
        this.store.set('isIndicatorActive', false);
        this.store.set('regressionResults', null);
        liveIndicatorService.disconnect(); // Disconnect live regression
        showToast('Indicator removed.', 'info');
    }
}

export const indicatorService = new IndicatorService(store);