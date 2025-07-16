// frontend_soa/src/ui/components/regressionVisualizer.js - FIXED for live mode
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
        this.lastKnownSlopes = new Map(); // Cache slopes for comparison
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

        // Get regression parameters
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

        const isLiveMode = store.get('isLiveMode');
        console.log(`📊 Updating regression lines for ${currentInterval}, Live Mode: ${isLiveMode}, Regression Length: ${this.currentRegressionLength}`);

        this.clearAllLines();

        // Create lines for each lookback period
        Object.entries(matchingTimeframe.results).forEach(([lookback, regressionData]) => {
            const lookbackNum = parseInt(lookback);
            
            // Debug slope values
            const currentSlope = regressionData.slope;
            const previousSlope = this.lastKnownSlopes.get(lookbackNum);
            
            console.log(`📊 Lookback ${lookback}: slope=${currentSlope.toFixed(8)}, r_value=${regressionData.r_value.toFixed(4)}`);
            
            // Check for suspicious horizontal lines
            if (Math.abs(currentSlope) < 1e-10 && previousSlope && Math.abs(previousSlope) > 1e-6) {
                console.warn(`⚠️ Suspicious horizontal line detected for lookback ${lookback}. Previous slope: ${previousSlope.toFixed(8)}, Current slope: ${currentSlope.toFixed(8)}`);
            }
            
            this.lastKnownSlopes.set(lookbackNum, currentSlope);
            this.createRegressionLine(lookbackNum, regressionData, chartData, isLiveMode);
        });
    }

    createRegressionLine(lookbackPeriod, regressionData, chartData, isLiveMode) {
        const chart = chartController.getChart();
        if (!chart) {
            console.error('Chart not available for regression line creation');
            return;
        }

        const { slope, r_value } = regressionData;
        
        // Enhanced debugging for live mode
        if (isLiveMode) {
            console.log(`🔴 LIVE MODE - Creating line for lookback ${lookbackPeriod}:`);
            console.log(`   Slope: ${slope.toFixed(10)}`);
            console.log(`   R-value: ${r_value.toFixed(6)}`);
            console.log(`   Chart data length: ${chartData.length}`);
            console.log(`   First candle time: ${chartData[0]?.time}, price: ${chartData[0]?.close}`);
            console.log(`   Last candle time: ${chartData[chartData.length-1]?.time}, price: ${chartData[chartData.length-1]?.close}`);
        }

        // Calculate line points with enhanced error checking
        const linePoints = this.calculateLinePointsWithValidation(lookbackPeriod, slope, chartData, isLiveMode);
        
        if (linePoints.length === 0) {
            console.warn(`No line points calculated for lookback ${lookbackPeriod}`);
            return;
        }

        // Additional validation for horizontal lines
        if (this.isLineHorizontal(linePoints)) {
            console.warn(`⚠️ Horizontal line detected for lookback ${lookbackPeriod}. Slope: ${slope.toFixed(10)}`);
            // Don't return - still show the line but with warning
        }

        const color = this.getColorForLookback(lookbackPeriod);
        
        const lineSeries = chart.addLineSeries({
            color: color,
            lineWidth: 2,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            title: `L${lookbackPeriod} (R²=${(r_value * r_value).toFixed(3)}, S=${slope.toFixed(6)})`
        });

        lineSeries.setData(linePoints);

        this.regressionLines.set(lookbackPeriod, {
            series: lineSeries,
            color: color,
            slope: slope,
            r_value: r_value,
            linePoints: linePoints // Store for debugging
        });

        console.log(`📈 Created regression line for lookback ${lookbackPeriod}, slope: ${slope.toFixed(8)}, points: ${linePoints.length}`);
    }

    calculateLinePointsWithValidation(lookbackPeriod, slope, chartData, isLiveMode) {
        try {
            // Enhanced validation and logging
            const sortedCandles = [...chartData].sort((a, b) => b.time - a.time);
            const dataLength = sortedCandles.length;
            
            if (isLiveMode) {
                console.log(`🔴 LIVE CALCULATION - Lookback ${lookbackPeriod}:`);
                console.log(`   Data length: ${dataLength}`);
                console.log(`   Regression length: ${this.currentRegressionLength}`);
                console.log(`   Slope from backend: ${slope.toFixed(10)}`);
            }

            // Validation checks
            if (lookbackPeriod >= dataLength) {
                console.warn(`Lookback ${lookbackPeriod} exceeds data length ${dataLength}`);
                return [];
            }

            const startIndex = lookbackPeriod;
            const endIndex = startIndex + this.currentRegressionLength;

            if (endIndex > dataLength) {
                console.warn(`End index ${endIndex} exceeds data length ${dataLength} for lookback ${lookbackPeriod}`);
                return [];
            }

            const candlesForRegression = sortedCandles.slice(startIndex, endIndex);
            
            if (candlesForRegression.length < 2) {
                console.warn(`Not enough candles for regression: ${candlesForRegression.length}`);
                return [];
            }

            // Enhanced debugging for live mode
            if (isLiveMode) {
                console.log(`🔴 LIVE WINDOW - Lookback ${lookbackPeriod}:`);
                console.log(`   Start index: ${startIndex}, End index: ${endIndex}`);
                console.log(`   Window size: ${candlesForRegression.length}`);
                console.log(`   Newest in window: time=${candlesForRegression[0].time}, price=${candlesForRegression[0].close}`);
                console.log(`   Oldest in window: time=${candlesForRegression[candlesForRegression.length-1].time}, price=${candlesForRegression[candlesForRegression.length-1].close}`);
            }

            // Check for timestamp issues
            const timeRange = candlesForRegression[0].time - candlesForRegression[candlesForRegression.length-1].time;
            const priceRange = Math.max(...candlesForRegression.map(c => c.close)) - Math.min(...candlesForRegression.map(c => c.close));
            
            if (isLiveMode) {
                console.log(`🔴 LIVE RANGES - Lookback ${lookbackPeriod}:`);
                console.log(`   Time range: ${timeRange} seconds`);
                console.log(`   Price range: ${priceRange.toFixed(4)}`);
                console.log(`   Expected slope magnitude: ${Math.abs(slope).toFixed(10)}`);
            }

            // Calculate intercept using middle point
            const middleIndex = Math.floor(candlesForRegression.length / 2);
            const middleCandle = candlesForRegression[middleIndex];
            
            // CRITICAL: Check if slope is being applied correctly
            const intercept = middleCandle.close - (slope * middleCandle.time);
            
            if (isLiveMode) {
                console.log(`🔴 LIVE INTERCEPT - Lookback ${lookbackPeriod}:`);
                console.log(`   Middle candle: time=${middleCandle.time}, price=${middleCandle.close}`);
                console.log(`   Calculated intercept: ${intercept.toFixed(6)}`);
                console.log(`   Slope * time: ${(slope * middleCandle.time).toFixed(6)}`);
            }

            // Generate line points
            const linePoints = [];
            
            for (let i = 0; i < candlesForRegression.length; i++) {
                const candle = candlesForRegression[i];
                const regressionValue = slope * candle.time + intercept;
                
                linePoints.push({
                    time: candle.time,
                    value: regressionValue
                });
            }

            // Sort by time ascending for the chart
            linePoints.sort((a, b) => a.time - b.time);

            // Enhanced validation of line points
            if (isLiveMode && linePoints.length > 1) {
                const firstPoint = linePoints[0];
                const lastPoint = linePoints[linePoints.length - 1];
                const actualSlope = (lastPoint.value - firstPoint.value) / (lastPoint.time - firstPoint.time);
                
                console.log(`🔴 LIVE VALIDATION - Lookback ${lookbackPeriod}:`);
                console.log(`   First point: time=${firstPoint.time}, value=${firstPoint.value.toFixed(6)}`);
                console.log(`   Last point: time=${lastPoint.time}, value=${lastPoint.value.toFixed(6)}`);
                console.log(`   Calculated slope: ${actualSlope.toFixed(10)}`);
                console.log(`   Expected slope: ${slope.toFixed(10)}`);
                console.log(`   Slope difference: ${Math.abs(actualSlope - slope).toFixed(12)}`);
                
                // Check for slope mismatch
                if (Math.abs(actualSlope - slope) > 1e-8) {
                    console.error(`❌ SLOPE MISMATCH for lookback ${lookbackPeriod}! Expected: ${slope.toFixed(10)}, Got: ${actualSlope.toFixed(10)}`);
                }
            }

            return linePoints;

        } catch (error) {
            console.error(`❌ Error calculating line points for lookback ${lookbackPeriod}:`, error);
            return [];
        }
    }

    isLineHorizontal(linePoints) {
        if (linePoints.length < 2) return false;
        
        const firstValue = linePoints[0].value;
        const lastValue = linePoints[linePoints.length - 1].value;
        const valueDifference = Math.abs(lastValue - firstValue);
        
        // Consider horizontal if value difference is very small
        return valueDifference < 1e-8;
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

    updateRegressionLength(newLength) {
        this.currentRegressionLength = newLength;
        console.log(`📊 Updated regression length to: ${newLength}`);
        
        if (this.isVisualizationEnabled) {
            this.updateRegressionLines(store.get('regressionResults'));
        }
    }

    // Debug method to investigate live mode issues
    debugLiveMode() {
        const isLiveMode = store.get('isLiveMode');
        const chartData = store.get('chartData');
        const results = store.get('regressionResults');
        
        console.log('🔍 DEBUG LIVE MODE:');
        console.log(`   Live mode: ${isLiveMode}`);
        console.log(`   Chart data length: ${chartData?.length || 0}`);
        console.log(`   Has regression results: ${!!results}`);
        console.log(`   Visualization enabled: ${this.isVisualizationEnabled}`);
        console.log(`   Active lines: ${this.regressionLines.size}`);
        
        if (chartData && chartData.length > 0) {
            console.log(`   Latest candle: time=${chartData[chartData.length-1].time}, price=${chartData[chartData.length-1].close}`);
        }
        
        if (results && results.regression_results) {
            const currentInterval = store.get('selectedInterval');
            const matchingTimeframe = results.regression_results.find(r => r.timeframe === currentInterval);
            if (matchingTimeframe) {
                console.log(`   Slopes for ${currentInterval}:`, Object.entries(matchingTimeframe.results).map(([k,v]) => `${k}:${v.slope.toFixed(8)}`));
            }
        }
        
        // Check individual line data
        this.regressionLines.forEach((lineData, lookback) => {
            console.log(`   Line ${lookback}: slope=${lineData.slope.toFixed(8)}, points=${lineData.linePoints?.length || 0}`);
            if (lineData.linePoints && lineData.linePoints.length > 1) {
                const first = lineData.linePoints[0];
                const last = lineData.linePoints[lineData.linePoints.length - 1];
                console.log(`     First: time=${first.time}, value=${first.value.toFixed(6)}`);
                console.log(`     Last: time=${last.time}, value=${last.value.toFixed(6)}`);
                console.log(`     Actual slope: ${((last.value - first.value) / (last.time - first.time)).toFixed(10)}`);
            }
        });
    }
}

export const regressionVisualizer = new RegressionVisualizer();