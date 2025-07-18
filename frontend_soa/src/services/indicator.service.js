// frontend_soa/src/services/indicator.service.js - Updated with pagination and timestamp support
import { store } from '../state/store.js';
import { showToast } from '../ui/helpers.js';
import { liveIndicatorService } from './liveIndicator.service.js';
import { regressionVisualizer } from '../ui/components/regressionVisualizer.js';

const API_BASE_URL = `http://${window.location.hostname}:8000`;

class IndicatorService {
    constructor(store) {
        this.store = store;
        this.currentPaginationCursor = null;
        this.accumulatedResults = null;
        this.isPaginating = false;
    }

    initialize() {
        console.log('IndicatorService Initialized');
    }

    async runRegressionAnalysis(settings) {
        this.store.set('isIndicatorLoading', true);
        this.store.set('isIndicatorActive', true);
        
        // Reset pagination state
        this.currentPaginationCursor = null;
        this.accumulatedResults = null;
        this.isPaginating = false;

        try {
            // Always include timestamps for consistency
            const startTime = this.store.get('startTime');
            const endTime = this.store.get('endTime');
            const timezone = this.store.get('selectedTimezone') || 'UTC';
            
            if (!startTime || !endTime) {
                showToast('Please set start and end times for regression analysis', 'error');
                this.store.set('isIndicatorLoading', false);
                this.store.set('isIndicatorActive', false);
                return;
            }

            const requestBody = {
                symbol: this.store.get('selectedSymbol'),
                exchange: this.store.get('selectedExchange'),
                regression_length: settings.length,
                lookback_periods: settings.lookbackPeriods,
                timeframes: settings.timeframes,
                // Always include timestamps
                start_time: startTime,
                end_time: endTime,
                timezone: timezone
            };

            console.log('📊 Running regression analysis with timestamps:', requestBody);

            // Fetch first page of results
            const results = await this.fetchRegressionPage(requestBody);
            
            if (!results) {
                throw new Error('No regression results returned');
            }

            // Store initial results
            this.accumulatedResults = results;
            this.store.set('regressionResults', this.accumulatedResults);

            // Check if there are more pages
            if (results.is_partial && results.request_id) {
                console.log('📄 Regression results are paginated. Fetching additional pages...');
                this.currentPaginationCursor = results.request_id;
                
                // Show initial results immediately
                showToast('Initial regression results loaded. Fetching more...', 'info');
                
                // Fetch remaining pages
                await this.fetchRemainingPages();
            }
            
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
            this.store.set('isIndicatorActive', false);
        } finally {
            this.store.set('isIndicatorLoading', false);
        }
    }

    async fetchRegressionPage(requestBody, cursor = null) {
        try {
            let url = `${API_BASE_URL}/regression`;
            let body = requestBody;

            // If we have a cursor, use the pagination endpoint
            if (cursor) {
                url = `${API_BASE_URL}/regression/page`;
                body = {
                    request_id: cursor,
                    limit: 50 // Adjust based on your needs
                };
            }

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
                throw new Error(errorData.detail || 'Failed to fetch regression data');
            }

            return await res.json();

        } catch (error) {
            console.error('Error fetching regression page:', error);
            throw error;
        }
    }

    async fetchRemainingPages() {
        this.isPaginating = true;
        let pagesLoaded = 1;

        try {
            while (this.currentPaginationCursor && pagesLoaded < 10) { // Limit to prevent infinite loops
                console.log(`📄 Fetching page ${pagesLoaded + 1}...`);
                
                const pageResults = await this.fetchRegressionPage(null, this.currentPaginationCursor);
                
                if (!pageResults) break;

                // Merge results
                this.mergeRegressionResults(pageResults);
                
                // Update store with accumulated results
                this.store.set('regressionResults', this.accumulatedResults);
                
                // Check if more pages exist
                if (pageResults.is_partial && pageResults.request_id) {
                    this.currentPaginationCursor = pageResults.request_id;
                    pagesLoaded++;
                } else {
                    // No more pages
                    this.currentPaginationCursor = null;
                    break;
                }
            }

            console.log(`✅ Loaded ${pagesLoaded} total pages of regression results`);
            
            if (this.currentPaginationCursor) {
                showToast(`Loaded ${pagesLoaded} pages. More results available.`, 'info');
            }

        } catch (error) {
            console.error('Error fetching remaining pages:', error);
            showToast('Error loading additional regression pages', 'warning');
        } finally {
            this.isPaginating = false;
        }
    }

    mergeRegressionResults(newResults) {
        if (!this.accumulatedResults) {
            this.accumulatedResults = newResults;
            return;
        }

        // Merge regression_results
        newResults.regression_results.forEach(newTimeframeResult => {
            const existingTimeframe = this.accumulatedResults.regression_results.find(
                r => r.timeframe === newTimeframeResult.timeframe
            );

            if (existingTimeframe) {
                // Merge results for the same timeframe
                Object.assign(existingTimeframe.results, newTimeframeResult.results);
                existingTimeframe.data_count = Math.max(
                    existingTimeframe.data_count || 0,
                    newTimeframeResult.data_count || 0
                );
                existingTimeframe.is_partial = newTimeframeResult.is_partial;
            } else {
                // Add new timeframe result
                this.accumulatedResults.regression_results.push(newTimeframeResult);
            }
        });

        // Update metadata
        this.accumulatedResults.is_partial = newResults.is_partial;
        this.accumulatedResults.request_id = newResults.request_id;
        this.accumulatedResults.timestamp = newResults.timestamp;
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
        
        // Reset pagination state
        this.currentPaginationCursor = null;
        this.accumulatedResults = null;
        this.isPaginating = false;
        
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
            isPaginating: this.isPaginating,
            hasResults: !!results,
            hasMorePages: !!this.currentPaginationCursor,
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

    // Method to manually load more pages
    async loadMorePages() {
        if (!this.currentPaginationCursor || this.isPaginating) {
            return;
        }

        showToast('Loading more regression results...', 'info');
        await this.fetchRemainingPages();
    }

    // Get pagination status
    getPaginationStatus() {
        return {
            hasCursor: !!this.currentPaginationCursor,
            isPaginating: this.isPaginating,
            canLoadMore: !!this.currentPaginationCursor && !this.isPaginating
        };
    }
}

export const indicatorService = new IndicatorService(store);