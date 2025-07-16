// frontend_soa/src/services/indicator.service.js - Updated with visualization support
import { store } from '../state/store.js';
import { showToast } from '../ui/helpers.js';
import { liveIndicatorService } from './liveIndicator.service.js';
import { regressionVisualizer } from '../ui/components/regressionVisualizer.js';

const API_BASE_URL = `http://${window.location.hostname}:8000`;

class IndicatorService {
    constructor(store) {
        this.store = store;
    }

    initialize() {
        console.log('IndicatorService Initialized');
    }

    async runRegressionAnalysis(settings) {
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

            console.log('📊 Running regression analysis:', requestBody);

            const res = await fetch(`${API_BASE_URL}/regression`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!res.ok) throw new Error('Failed to fetch regression data');

            const results = await res.json();
            
            // Enhanced logging for debugging
            console.log('📊 Regression analysis results:', results);
            if (results.regression_results) {
                results.regression_results.forEach(timeframe => {
                    console.log(`📊 Timeframe ${timeframe.timeframe}:`);
                    Object.entries(timeframe.results).forEach(([lookback, data]) => {
                        console.log(`   Lookback ${lookback}: slope=${data.slope.toFixed(8)}, r_value=${data.r_value.toFixed(4)}`);
                    });
                });
            }
            
            this.store.set('regressionResults', results);
            
            // Auto-enable visualization if requested
            if (settings.autoEnableVisualization) {
                await this.enableVisualization();
            }
            
            showToast('Regression analysis complete.', 'success');
            console.log('✅ Regression analysis completed successfully');

            // Connect to live regression if enabled
            if (settings.enableLive && this.store.get('isLiveMode')) {
                console.log('🔴 Connecting to live regression updates...');
                liveIndicatorService.connect({
                    ...requestBody, 
                    regression_length: settings.length, 
                    lookback_periods: settings.lookbackPeriods
                });
            }

        } catch (error) {
            console.error('❌ Failed to run regression analysis:', error);
            showToast(error.message, 'error');
            this.store.set('regressionResults', null);
        } finally {
            this.store.set('isIndicatorLoading', false);
        }
    }

    async enableVisualization() {
        try {
            const currentInterval = this.store.get('selectedInterval');
            const results = this.store.get('regressionResults');
            
            if (!results || !results.regression_results) {
                showToast('No regression results available for visualization', 'warning');
                return false;
            }

            // Check if current interval has regression data
            const hasCurrentInterval = results.regression_results.some(
                result => result.timeframe === currentInterval
            );

            if (!hasCurrentInterval) {
                showToast(`No regression data available for current timeframe: ${currentInterval}`, 'warning');
                return false;
            }

            // Enable visualization
            regressionVisualizer.enableVisualization(currentInterval);
            
            // Update UI button state
            const visualizeBtn = document.getElementById('visualize-regression-btn');
            if (visualizeBtn) {
                visualizeBtn.innerHTML = '<i class="fas fa-eye"></i> Hide Lines';
                visualizeBtn.classList.add('btn-active');
            }

            console.log('📈 Regression visualization enabled automatically');
            return true;

        } catch (error) {
            console.error('❌ Failed to enable visualization:', error);
            showToast('Failed to enable visualization', 'error');
            return false;
        }
    }
    
    removeRegressionAnalysis() {
        console.log('🗑️ Removing regression analysis...');
        
        // Disable visualization first
        regressionVisualizer.disableVisualization();
        
        // Update UI button state
        const visualizeBtn = document.getElementById('visualize-regression-btn');
        if (visualizeBtn) {
            visualizeBtn.innerHTML = '<i class="fas fa-chart-line"></i> Visualize';
            visualizeBtn.classList.remove('btn-active');
        }
        
        // Remove indicator data
        this.store.set('isIndicatorActive', false);
        this.store.set('regressionResults', null);
        
        // Disconnect live regression
        liveIndicatorService.disconnect();
        
        showToast('Indicator removed.', 'info');
        console.log('✅ Regression analysis removed');
    }

    // Method to toggle visualization state
    toggleVisualization() {
        const visualizationState = regressionVisualizer.getVisualizationState();
        
        if (visualizationState.enabled) {
            regressionVisualizer.disableVisualization();
            return false;
        } else {
            const currentInterval = this.store.get('selectedInterval');
            regressionVisualizer.enableVisualization(currentInterval);
            return true;
        }
    }

    // Method to get current analysis state
    getAnalysisState() {
        const results = this.store.get('regressionResults');
        const visualizationState = regressionVisualizer.getVisualizationState();
        
        return {
            isActive: this.store.get('isIndicatorActive'),
            isLoading: this.store.get('isIndicatorLoading'),
            hasResults: !!results,
            visualizationEnabled: visualizationState.enabled,
            currentTimeframe: visualizationState.timeframe,
            availableTimeframes: visualizationState.availableTimeframes,
            isLiveConnected: this.store.get('isLiveRegressionConnected'),
            lineCount: visualizationState.lineCount
        };
    }

    // Method to update visualization when timeframe changes
    updateVisualizationTimeframe(newTimeframe) {
        const visualizationState = regressionVisualizer.getVisualizationState();
        
        if (visualizationState.enabled) {
            regressionVisualizer.setVisualizationTimeframe(newTimeframe);
            console.log(`📊 Updated visualization timeframe to: ${newTimeframe}`);
        }
    }
}

export const indicatorService = new IndicatorService(store);