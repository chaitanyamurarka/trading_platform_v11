import { store } from '../../state/store.js';
import { chartController } from '../../chart/chart.controller.js';
import { showToast } from '../helpers.js';

class RegressionVisualizer {
    constructor() {
        this.regressionLines = new Map();
        this.isVisualizationEnabled = false;
        this.currentTimeframe = null;
        this.currentRegressionLength = 20;
        this.colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD',
            '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA'
        ];
        this.lastKnownSlopes = new Map();
        this.updateDebounceTimer = null;
        this.liveUpdateInterval = null;
    }

    initialize() {
        store.subscribe('regressionResults', (results) => {
            this.updateRegressionLines(results);
        });

        store.subscribe('chartData', (data) => {
            if (this.isVisualizationEnabled && data && data.length > 0) {
                this.updateRegressionLines(store.get('regressionResults'));
            }
        });

        store.subscribe('isLiveRegressionConnected', (isConnected) => {
            if (isConnected && this.isVisualizationEnabled) {
                this.startLiveUpdates();
            }
        });

        store.subscribe('isLiveMode', (isLive) => {
            if (this.isVisualizationEnabled) {
                if (isLive) {
                    this.startLiveUpdateInterval();
                    this.setupChartRangeListener();
                } else {
                    if (this.liveUpdateInterval) {
                        clearInterval(this.liveUpdateInterval);
                        this.liveUpdateInterval = null;
                    }
                }
            }
        });

        console.log('RegressionVisualizer initialized');
    }

    setupChartRangeListener() {
        const chart = chartController.getChart();
        if (!chart) return;
        
        chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
            if (this.isVisualizationEnabled && store.get('isLiveMode')) {
                if (this.rangeChangeTimer) {
                    clearTimeout(this.rangeChangeTimer);
                }
                
                this.rangeChangeTimer = setTimeout(() => {
                    const results = store.get('regressionResults');
                    if (results) {
                        this.updateRegressionLines(results);
                    }
                }, 300);
            }
        });
    }

    enableVisualization(timeframe) {
        this.isVisualizationEnabled = true;
        this.currentTimeframe = timeframe;
        
        const results = store.get('regressionResults');
        if (results) {
            this.updateRegressionLines(results);
        }
            
        this.setupChartRangeListener();

        if (store.get('isLiveMode')) {
            this.startLiveUpdateInterval();
        }
        
        showToast(`Regression visualization enabled for ${timeframe}`, 'success');
        console.log(`📈 Regression visualization enabled for ${timeframe}`);
    }

    disableVisualization() {
        this.isVisualizationEnabled = false;
        this.clearAllLines();
        
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
            this.updateDebounceTimer = null;
        }
        
        if (this.liveUpdateInterval) {
            clearInterval(this.liveUpdateInterval);
            this.liveUpdateInterval = null;
        }
        
        showToast('Regression visualization disabled', 'info');
        console.log('📉 Regression visualization disabled');
    }

    startLiveUpdateInterval() {
        if (this.liveUpdateInterval) {
            clearInterval(this.liveUpdateInterval);
        }
        
        this.liveUpdateInterval = setInterval(() => {
            if (this.isVisualizationEnabled && store.get('isLiveMode')) {
                const results = store.get('regressionResults');
                if (results) {
                    this.updateRegressionLines(results);
                }
            }
        }, 2000);
        
        console.log('📡 Started live update interval for regression lines');
    }

    updateRegressionLines(results) {
        if (!this.isVisualizationEnabled || !results || !results.regression_results) {
            return;
        }

        const chartData = store.get('chartData');
        if (!chartData || chartData.length === 0) {
            return;
        }

        if (results.request_params && results.request_params.regression_length) {
            this.currentRegressionLength = results.request_params.regression_length;
        }

        const currentInterval = store.get('selectedInterval');
        const matchingTimeframe = results.regression_results.find(
            result => result.timeframe === currentInterval
        );

        if (!matchingTimeframe) {
            console.log(`No regression results found for timeframe: ${currentInterval}`);
            return;
        }

        this.clearAllLines();

        Object.entries(matchingTimeframe.results).forEach(([lookback, regressionData]) => {
            const lookbackNum = parseInt(lookback);
            this.createRegressionLine(lookbackNum, regressionData, chartData);
        });
    }

    createRegressionLine(lookbackPeriod, regressionData, chartData) {
        const chart = chartController.getChart();
        if (!chart) {
            return;
        }

        const { slope, intercept, r_value, std_dev, start_timestamp } = regressionData; // ADD start_timestamp HERE
        
        // Pass the start_timestamp to calculateLinePoints
        const linePoints = this.calculateLinePoints(lookbackPeriod, slope, intercept, chartData, start_timestamp); // MODIFY THIS LINE
        
        if (linePoints.length === 0) {
            return;
        }

        const color = this.getColorForLookback(lookbackPeriod);

        // --- Create Upper and Lower Channel Data ---
        const upperChannelPoints = linePoints.map(p => ({ time: p.time, value: p.value + (2 * std_dev) }));
        const lowerChannelPoints = linePoints.map(p => ({ time: p.time, value: p.value - (2 * std_dev) }));

        const sharedLineOptions = {
            lineWidth: 1,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
        };

        // --- Draw the lines ---
        const baseLineSeries = chart.addLineSeries({ ...sharedLineOptions, color: color, lineWidth: 2, title: `L${lookbackPeriod}` });
        const upperLineSeries = chart.addLineSeries({ ...sharedLineOptions, color: '#367d39' }); // Green for upper
        const lowerLineSeries = chart.addLineSeries({ ...sharedLineOptions, color: '#b53331' }); // Red for lower

        baseLineSeries.setData(linePoints);
        upperLineSeries.setData(upperChannelPoints);
        lowerLineSeries.setData(lowerChannelPoints);

        this.regressionLines.set(lookbackPeriod, {
            base: baseLineSeries,
            upper: upperLineSeries,
            lower: lowerLineSeries,
            color: color,
        });

        console.log(`📈 Created regression channel for lookback ${lookbackPeriod}`);
    }


    calculateLinePoints(lookbackPeriod, slope, intercept, chartData, start_timestamp) { // ADD start_timestamp HERE
        if (!start_timestamp) {
            console.warn(`Cannot calculate line points for lookback ${lookbackPeriod} without a start_timestamp.`);
            return [];
        }

        // --- START: TOLERANT TIMESTAMP MATCHING LOGIC ---
        let closestIndex = -1;
        let smallestDiff = Infinity;

        for (let i = 0; i < chartData.length; i++) {
            const diff = Math.abs(chartData[i].time - start_timestamp);
            if (diff < smallestDiff) {
                smallestDiff = diff;
                closestIndex = i;
            }
        }
        
        // Consider it a match if the difference is less than a small threshold (e.g., half a second)
        if (closestIndex === -1 || smallestDiff > 0.5) {
             console.warn(`Could not find a close enough starting candle for timestamp ${start_timestamp} (Lookback: ${lookbackPeriod}). Smallest difference was ${smallestDiff}`);
             return [];
        }

        const startIndex = closestIndex;
        // --- END: TOLERANT TIMESTAMP MATCHING LOGIC ---

        const dataLength = chartData.length;
        const endIndex = startIndex + this.currentRegressionLength;

        if (endIndex > dataLength) {
             console.warn(`Regression length extends beyond available chart data for lookback ${lookbackPeriod}.`);
            return [];
        }
        
        const linePoints = [];
        for (let i = 0; i < this.currentRegressionLength; i++) {
            const candleIndex = startIndex + i;
            if (candleIndex >= dataLength) break;

            const x_value = i;
            const regressionValue = intercept + slope * x_value;
            
            linePoints.push({
                time: chartData[candleIndex].time,
                value: regressionValue
            });
        }
        
        return linePoints;
    }
 
    getColorForLookback(lookbackPeriod) {
        const commonColors = {
            0: '#FF6B6B', 1: '#4ECDC4', 2: '#45B7D1', 3: '#96CEB4', 
            5: '#FFEAA7', 10: '#DDA0DD', 20: '#98D8C8', 30: '#F7DC6F'
        };

        return commonColors[lookbackPeriod] || this.colors[lookbackPeriod % this.colors.length];
    }

    clearAllLines() {
        const chart = chartController.getChart();
        if (!chart) return;

        this.regressionLines.forEach((seriesGroup) => {
            try {
                chart.removeSeries(seriesGroup.base);
                chart.removeSeries(seriesGroup.upper);
                chart.removeSeries(seriesGroup.lower);
            } catch (error) {
                // Ignore errors if series already removed
            }
        });

        this.regressionLines.clear();
        console.log('🧹 Cleared all regression lines');
    }
    
    // ... (other methods remain the same) ...
    startLiveUpdates() {
        console.log('📡 Started live regression line updates');
    }

    toggleVisualization() {
        const currentInterval = store.get('selectedInterval');
        
        if (this.isVisualizationEnabled) {
            this.disableVisualization();
            return false;
        } else {
            this.enableVisualization(currentInterval);
            return true;
        }
    }

    getVisualizationState() {
        return {
            enabled: this.isVisualizationEnabled,
            timeframe: this.currentTimeframe,
            lineCount: this.regressionLines.size,
            regressionLength: this.currentRegressionLength,
            availableTimeframes: this.getAvailableTimeframes()
        };
    }

    getAvailableTimeframes() {
        const results = store.get('regressionResults');
        if (!results || !results.regression_results) {
            return [];
        }
        return results.regression_results.map(result => result.timeframe);
    }

    setVisualizationTimeframe(timeframe) {
        if (this.isVisualizationEnabled) {
            this.currentTimeframe = timeframe;
            this.updateRegressionLines(store.get('regressionResults'));
        }
    }
}

export const regressionVisualizer = new RegressionVisualizer();