// frontend_soa/src/chart/chart.controller.js
import { store } from '../state/store.js';
import { getDomElements } from '../ui/dom.js';
import { getChartOptions } from './chart.options.js';
import { createMainSeries, createVolumeSeries } from './chart.series.js';

class ChartController {
    constructor(store) {
        this.store = store;
        this.elements = getDomElements();
        this.chart = null;
        this.mainSeries = null;
        this.volumeSeries = null;
    }

    initialize() {
        if (!this.elements.chartContainer) return;

        // Get initial theme from localStorage or default to light
        const savedTheme = localStorage.getItem('chartTheme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        this.chart = LightweightCharts.createChart(this.elements.chartContainer, getChartOptions(savedTheme));
        
        this.mainSeries = createMainSeries(this.chart, this.store.get('selectedChartType'));
        this.volumeSeries = createVolumeSeries(this.chart);
        
        // Configure volume series scale
        this.chart.priceScale('').applyOptions({ 
            scaleMargins: { top: 0.85, bottom: 0 } 
        });
        
        // Subscribe to data and UI changes from the store
        this.store.subscribe('chartData', (data) => {
            if (this.mainSeries && data) {
                this.mainSeries.setData(data);
            }
        });
        
        this.store.subscribe('volumeData', (data) => {
            if (this.volumeSeries && data) {
                this.volumeSeries.setData(data);
            }
        });
        
        this.store.subscribe('isLoading', (isLoading) => this.toggleLoadingIndicator(isLoading));
        
        // NEW: Subscribe to chart type changes
        this.store.subscribe('selectedChartType', (chartType) => {
            this.recreateMainSeries(chartType);
        });
        
        // NEW: Subscribe to theme changes
        this.store.subscribe('theme', (theme) => {
            this.applyTheme(theme);
        });
        
        this.setupInfiniteScroll();
        this.setupResizeHandler();
        this.setupCrosshairMovement();
        
        console.log('ChartController Initialized');
    }

    recreateMainSeries(chartType) {
        if (!this.chart) return;
        
        // Get current data before removing series
        const currentData = this.store.get('chartData') || [];
        
        // Remove existing main series
        if (this.mainSeries) {
            this.chart.removeSeries(this.mainSeries);
        }
        
        // Create new series with the selected type
        this.mainSeries = createMainSeries(this.chart, chartType);
        
        // Restore data to new series
        if (currentData.length > 0) {
            this.mainSeries.setData(currentData);
        }
    }

    applyTheme(theme) {
        if (!this.chart) return;
        
        // Apply new chart options with the theme
        this.chart.applyOptions(getChartOptions(theme));
        
        // Save theme preference
        localStorage.setItem('chartTheme', theme);
        
        // Update document theme attribute
        document.documentElement.setAttribute('data-theme', theme);
    }

    toggleLoadingIndicator(isLoading) {
        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.style.display = isLoading ? 'flex' : 'none';
        }
        
        if (!isLoading && this.chart) {
            // Auto-scale and fit content after loading
            this.chart.timeScale().fitContent();
            this.applyAutoscaling();
        }
    }
    
    // Called by WebSocket service for live updates
    updateBar(barData) {
        if (!this.mainSeries || !this.volumeSeries) return;
        
        const chartBar = { 
            time: barData.unix_timestamp, 
            open: barData.open, 
            high: barData.high, 
            low: barData.low, 
            close: barData.close 
        };
        
        const volumeBar = { 
            time: barData.unix_timestamp, 
            value: barData.volume || 0, 
            color: barData.close >= barData.open ? '#10b98180' : '#ef444480' 
        };
        
        this.mainSeries.update(chartBar);
        this.volumeSeries.update(volumeBar);
    }

    setupInfiniteScroll() {
        if (!this.chart) return;
        
        this.chart.timeScale().subscribeVisibleLogicalRangeChange((newRange) => {
            if (newRange && newRange.from <= 10 && !this.store.get('isLoading')) {
                // Import dataService dynamically to avoid circular dependency
                import('../services/data.service.js').then(({ dataService }) => {
                    dataService.fetchNextChunk();
                });
            }
        });
    }

    setupResizeHandler() {
        window.addEventListener('resize', () => {
            if (this.chart && this.elements.chartContainer) {
                this.chart.resize(
                    this.elements.chartContainer.clientWidth, 
                    this.elements.chartContainer.clientHeight
                );
            }
        });
    }

    setupCrosshairMovement() {
        if (!this.chart) return;
        
        this.chart.subscribeCrosshairMove((param) => {
            this.updateDataLegend(param);
        });
    }

    updateDataLegend(param) {
        const dataLegend = document.getElementById('data-legend');
        if (!dataLegend) return;

        if (!param.time || !param.seriesPrices || param.seriesPrices.size === 0) {
            // Show latest values when not hovering
            this.showLatestOHLCValues();
            return;
        }

        const priceData = param.seriesPrices.get(this.mainSeries);
        if (!priceData) {
            this.showLatestOHLCValues();
            return;
        }
        
        let volumeDataForLegend = null;
        const rawVolumeValue = this.volumeSeries ? param.seriesPrices.get(this.volumeSeries) : undefined;

        if (rawVolumeValue !== undefined) {
            volumeDataForLegend = { value: rawVolumeValue };
        }
        
        this.updateOHLCLegend(priceData, volumeDataForLegend);
    }

    showLatestOHLCValues() {
        const currentData = this.store.get('chartData');
        const currentVolumeData = this.store.get('volumeData');
        
        if (!currentData || currentData.length === 0) {
            const dataLegend = document.getElementById('data-legend');
            if (dataLegend) {
                dataLegend.style.display = 'none';
            }
            return;
        }
        
        const latestPrice = currentData[currentData.length - 1];
        const latestVolume = currentVolumeData && currentVolumeData.length > 0 
            ? currentVolumeData[currentVolumeData.length - 1] 
            : null;
            
        this.updateOHLCLegend(latestPrice, latestVolume);
    }

    updateOHLCLegend(priceData, volumeData) {
        const dataLegend = document.getElementById('data-legend');
        if (!dataLegend || !priceData) {
            if (dataLegend) dataLegend.style.display = 'none';
            return;
        }

        const symbol = this.store.get('selectedSymbol');
        const candleType = this.store.get('selectedCandleType');
        const candleTypeLabel = candleType === 'heikin_ashi' ? 'HA' : 'Regular';
        const isBullish = priceData.close >= priceData.open;
        const changeColor = isBullish ? '#26a69a' : '#ef5350';
        const change = priceData.close - priceData.open;
        const changePercent = priceData.open !== 0 ? (change / priceData.open) * 100 : 0;
        
        const formatPrice = (price) => price ? parseFloat(price).toFixed(2) : 'N/A';
        const formatVolume = (volume) => {
            if (!volume) return 'N/A';
            const num = parseInt(volume);
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        };
        
        dataLegend.innerHTML = `
            <div class="space-y-1">
                <div class="font-bold text-sm">${symbol} <span class="text-xs text-blue-400">${candleTypeLabel}</span></div>
                <div class="flex items-center gap-3 text-xs">
                    <span>O: <span class="font-mono">${formatPrice(priceData.open)}</span></span>
                    <span>H: <span class="font-mono">${formatPrice(priceData.high)}</span></span>
                    <span>L: <span class="font-mono">${formatPrice(priceData.low)}</span></span>
                    <span>C: <span class="font-mono">${formatPrice(priceData.close)}</span></span>
                    <span>Vol: <span class="font-mono">${formatVolume(volumeData?.value)}</span></span>
                    <span style="color: ${changeColor}">Δ: ${change.toFixed(2)} (${changePercent.toFixed(2)}%)</span>
                </div>
            </div>`;
        dataLegend.style.display = 'block';
    }

    // NEW: Auto-scaling functionality similar to frontend_services
    applyAutoscaling() {
        if (!this.chart) return;

        // Apply autoscale to the price and time axes
        this.chart.priceScale().applyOptions({ autoScale: true });
        this.chart.timeScale().applyOptions({ rightOffset: 12 });

        // Set the visible range to the most recent 100 bars
        const currentData = this.store.get('chartData');
        if (currentData && currentData.length > 0) {
            const dataSize = currentData.length;
            this.chart.timeScale().setVisibleLogicalRange({
                from: Math.max(0, dataSize - 100),
                to: dataSize - 1
            });
        }

        // Scroll to the far right of the chart to see the latest bar
        this.chart.timeScale().scrollToRealTime();
    }

    // NEW: Screenshot functionality
    takeScreenshot() {
        if (!this.chart) return;
        
        try {
            const canvas = this.chart.takeScreenshot();
            this.downloadChartScreenshot(canvas);
        } catch (error) {
            console.error('Failed to take screenshot:', error);
        }
    }

    downloadChartScreenshot(canvas) {
        if (!canvas) return;
        
        const link = document.createElement('a');
        link.href = canvas.toDataURL();
        link.download = `chart-screenshot-${new Date().toISOString()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Public API methods
    getChart() {
        return this.chart;
    }

    getMainSeries() {
        return this.mainSeries;
    }

    getVolumeSeries() {
        return this.volumeSeries;
    }
}

export const chartController = new ChartController(store);