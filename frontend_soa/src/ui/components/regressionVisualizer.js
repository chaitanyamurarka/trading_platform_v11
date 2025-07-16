// frontend_soa/src/ui/components/regressionVisualizer.js - CORRECTED with your custom logic
import { store } from '../../state/store.js';
import { chartController } from '../../chart/chart.controller.js';
import { showToast } from '../helpers.js';

class RegressionVisualizer {
    constructor() {
        this.regressionLines = new Map(); // Map of lookback -> line series
        this.isVisualizationEnabled = false;
        this.currentTimeframe = null;
        this.currentRegressionLength = 20; // Default, will be updated from results
        this.colors = [
            '#FF6B6B', // Red
            '#4ECDC4', // Teal
            '#45B7D1', // Blue
            '#96CEB4', // Green
            '#FFEAA7', // Yellow
            '#DDA0DD', // Plum
            '#98D8C8', // Mint
            '#F7DC6F', // Light Yellow
            '#BB8FCE', // Light Purple
            '#85C1E9', // Light Blue
            '#F8C471', // Orange
            '#82E0AA', // Light Green
        ];
        this.colorIndex = 0;
    }

    initialize() {
        // Subscribe to regression results changes
        store.subscribe('regressionResults', (results) => {
            this.updateRegressionLines(results);
        });

        // Subscribe to chart data changes to update line positions
        store.subscribe('chartData', (data) => {
            if (this.isVisualizationEnabled && data && data.length > 0) {
                this.updateRegressionLines(store.get('regressionResults'));
            }
        });

        // Subscribe to live regression updates
        store.subscribe('isLiveRegressionConnected', (isConnected) => {
            if (isConnected && this.isVisualizationEnabled) {
                this.startLiveUpdates();
            }
        });

        console.log('RegressionVisualizer initialized');
    }

    enableVisualization(timeframe) {
        this.isVisualizationEnabled = true;
        this.currentTimeframe = timeframe;
        
        const results = store.get('regressionResults');
        if (results) {
            this.updateRegressionLines(results);
        }
        
        showToast(`Regression visualization enabled for ${timeframe}`, 'success');
        console.log(`📈 Regression visualization enabled for ${timeframe}`);
    }

    disableVisualization() {
        this.isVisualizationEnabled = false;
        this.clearAllLines();
        showToast('Regression visualization disabled', 'info');
        console.log('📉 Regression visualization disabled');
    }

    updateRegressionLines(results) {
        if (!this.isVisualizationEnabled || !results || !results.regression_results) {
            return;
        }

        const chartData = store.get('chartData');
        if (!chartData || chartData.length === 0) {
            return;
        }

        // Get regression parameters from results
        if (results.request_params && results.request_params.regression_length) {
            this.currentRegressionLength = results.request_params.regression_length;
        }

        // Find the timeframe that matches current chart interval
        const currentInterval = store.get('selectedInterval');
        const matchingTimeframe = results.regression_results.find(
            result => result.timeframe === currentInterval
        );

        if (!matchingTimeframe) {
            console.log(`No regression results found for timeframe: ${currentInterval}`);
            return;
        }

        console.log(`📊 Updating regression lines for ${currentInterval} with regression length ${this.currentRegressionLength}`);
        this.clearAllLines();
        this.colorIndex = 0;

        // Create lines for each lookback period
        Object.entries(matchingTimeframe.results).forEach(([lookback, regressionData]) => {
            this.createRegressionLine(parseInt(lookback), regressionData, chartData);
        });
    }

    createRegressionLine(lookbackPeriod, regressionData, chartData) {
        const chart = chartController.getChart();
        if (!chart) {
            console.error('Chart not available for regression line creation');
            return;
        }

        const { slope, r_value } = regressionData;
        
        // Calculate line points using YOUR CUSTOM LOGIC
        const linePoints = this.calculateLinePointsCustomLogic(lookbackPeriod, slope, chartData);
        if (linePoints.length === 0) {
            console.warn(`No line points calculated for lookback ${lookbackPeriod}`);
            return;
        }

        // Get color for this lookback period
        const color = this.getColorForLookback(lookbackPeriod);
        
        // Create line series
        const lineSeries = chart.addLineSeries({
            color: color,
            lineWidth: 2,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            title: `L${lookbackPeriod} (R²=${(r_value * r_value).toFixed(3)})`
        });

        // Set line data
        lineSeries.setData(linePoints);

        // Store reference
        this.regressionLines.set(lookbackPeriod, {
            series: lineSeries,
            color: color,
            slope: slope,
            r_value: r_value
        });

        console.log(`📈 Created regression line for lookback ${lookbackPeriod}, slope: ${slope.toFixed(6)}, R²: ${(r_value * r_value).toFixed(3)}`);
    }

    calculateLinePointsCustomLogic(lookbackPeriod, slope, chartData) {
        try {
            // CORRECTED: Follow your exact microservice logic
            // Data in chartData is in ascending order (oldest to newest)
            // But your backend sorts it DESCENDING (newest first) before processing
            
            // Step 1: Sort data DESCENDING to match your backend logic
            const sortedCandles = [...chartData].sort((a, b) => b.time - a.time);
            const dataLength = sortedCandles.length;
            
            console.log(`📊 Calculating line for lookback ${lookbackPeriod}, data length: ${dataLength}, regression length: ${this.currentRegressionLength}`);
            
            // Step 2: Apply your exact indexing logic
            if (lookbackPeriod >= dataLength) {
                console.warn(`Lookback ${lookbackPeriod} exceeds data length ${dataLength}`);
                return [];
            }

            const startIndex = lookbackPeriod; // Start FROM lookback periods ago
            const endIndex = startIndex + this.currentRegressionLength; // Go FORWARD regression_length bars

            if (endIndex > dataLength) {
                console.warn(`End index ${endIndex} exceeds data length ${dataLength} for lookback ${lookbackPeriod}`);
                return [];
            }

            // Step 3: Get the exact candles used for regression (same as your backend)
            const candlesForRegression = sortedCandles.slice(startIndex, endIndex);
            
            if (candlesForRegression.length < 2) {
                console.warn(`Not enough candles for regression: ${candlesForRegression.length}`);
                return [];
            }

            // Step 4: Your backend reverses the data for regression calculation
            // So the "first" candle in regression is actually the oldest in the window
            const oldestCandleInWindow = candlesForRegression[candlesForRegression.length - 1];
            const newestCandleInWindow = candlesForRegression[0];

            console.log(`📊 Regression window: ${oldestCandleInWindow.time} to ${newestCandleInWindow.time}`);

            // Step 5: Calculate regression line using the slope
            // We need to reconstruct the line using y = mx + b
            // The slope is calculated from (time, close) pairs
            
            // Get the middle point of the regression window to calculate intercept
            const middleIndex = Math.floor(candlesForRegression.length / 2);
            const middleCandle = candlesForRegression[middleIndex];
            
            // Calculate intercept: b = y - mx
            const intercept = middleCandle.close - (slope * middleCandle.time);

            // Step 6: Generate line points for the EXACT regression window
            const linePoints = [];
            
            // Generate points for the exact window used in regression
            for (let i = 0; i < candlesForRegression.length; i++) {
                const candle = candlesForRegression[i];
                const regressionValue = slope * candle.time + intercept;
                
                linePoints.push({
                    time: candle.time,
                    value: regressionValue
                });
            }

            // Sort line points by time (ascending) for the chart
            linePoints.sort((a, b) => a.time - b.time);

            console.log(`📈 Generated ${linePoints.length} line points for lookback ${lookbackPeriod}`);
            return linePoints;

        } catch (error) {
            console.error(`❌ Error calculating line points for lookback ${lookbackPeriod}:`, error);
            return [];
        }
    }

    getColorForLookback(lookbackPeriod) {
        // Assign consistent colors to lookback periods
        const commonColors = {
            0: '#FF6B6B',   // Red for immediate (0 lookback)
            1: '#4ECDC4',   // Teal for 1 period
            2: '#45B7D1',   // Blue for 2 periods
            3: '#96CEB4',   // Green for 3 periods
            5: '#FFEAA7',   // Yellow for 5 periods
            10: '#DDA0DD',  // Plum for 10 periods
            20: '#98D8C8',  // Mint for 20 periods
            30: '#F7DC6F',  // Light Yellow for 30 periods
        };

        if (commonColors[lookbackPeriod]) {
            return commonColors[lookbackPeriod];
        }

        // For other lookback periods, use cycling colors
        const colorIndex = lookbackPeriod % this.colors.length;
        return this.colors[colorIndex];
    }

    clearAllLines() {
        const chart = chartController.getChart();
        if (!chart) return;

        // Remove all regression line series
        this.regressionLines.forEach(({ series }) => {
            try {
                chart.removeSeries(series);
            } catch (error) {
                console.warn('Error removing regression line:', error);
            }
        });

        this.regressionLines.clear();
        console.log('🧹 Cleared all regression lines');
    }

    startLiveUpdates() {
        // This will be called when live regression updates are received
        // The lines will be updated automatically through the store subscription
        console.log('📡 Started live regression line updates');
    }

    // Public method to toggle visualization for current timeframe
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

    // Public method to get current visualization state
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

    // Method to update visualization for a specific timeframe
    setVisualizationTimeframe(timeframe) {
        if (this.isVisualizationEnabled) {
            this.currentTimeframe = timeframe;
            this.updateRegressionLines(store.get('regressionResults'));
        }
    }

    // Method to get line info for display
    getLineInfo() {
        const lineInfo = [];
        this.regressionLines.forEach((lineData, lookback) => {
            lineInfo.push({
                lookback: lookback,
                color: lineData.color,
                slope: lineData.slope,
                r_value: lineData.r_value,
                r_squared: lineData.r_value * lineData.r_value
            });
        });
        
        return lineInfo.sort((a, b) => a.lookback - b.lookback);
    }

    // Method to update regression length when new results arrive
    updateRegressionLength(newLength) {
        this.currentRegressionLength = newLength;
        console.log(`📊 Updated regression length to: ${newLength}`);
        
        // Re-calculate lines if visualization is enabled
        if (this.isVisualizationEnabled) {
            this.updateRegressionLines(store.get('regressionResults'));
        }
    }

    // Debug method to verify logic matches backend
    debugRegressionWindow(lookbackPeriod) {
        const chartData = store.get('chartData');
        if (!chartData || chartData.length === 0) return null;

        const sortedCandles = [...chartData].sort((a, b) => b.time - a.time);
        const startIndex = lookbackPeriod;
        const endIndex = startIndex + this.currentRegressionLength;
        
        const candlesForRegression = sortedCandles.slice(startIndex, endIndex);
        
        return {
            totalCandles: sortedCandles.length,
            startIndex: startIndex,
            endIndex: endIndex,
            regressionWindowSize: candlesForRegression.length,
            oldestInWindow: candlesForRegression[candlesForRegression.length - 1],
            newestInWindow: candlesForRegression[0],
            regressionLength: this.currentRegressionLength
        };
    }
}

export const regressionVisualizer = new RegressionVisualizer();