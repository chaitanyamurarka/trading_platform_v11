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

        this.chart = LightweightCharts.createChart(this.elements.chartContainer, getChartOptions('light'));
        
        this.mainSeries = createMainSeries(this.chart, this.store.get('selectedChartType'));
        this.volumeSeries = createVolumeSeries(this.chart);
        
        // Subscribe to data and UI changes from the store
        this.store.subscribe('chartData', (data) => this.mainSeries.setData(data));
        this.store.subscribe('volumeData', (data) => this.volumeSeries.setData(data));
        this.store.subscribe('isLoading', (isLoading) => this.toggleLoadingIndicator(isLoading));
        
        window.addEventListener('resize', () => this.chart.resize(this.elements.chartContainer.clientWidth, this.elements.chartContainer.clientHeight));
        console.log('ChartController Initialized');
    }

    toggleLoadingIndicator(isLoading) {
        this.elements.loadingIndicator.style.display = isLoading ? 'flex' : 'none';
        if (!isLoading) {
            this.chart.timeScale().fitContent();
        }
    }
    
    // Called by WebSocket service for live updates
    updateBar(barData) {
        const chartBar = { time: barData.unix_timestamp, open: barData.open, high: barData.high, low: barData.low, close: barData.close };
        const volumeBar = { time: barData.unix_timestamp, value: barData.volume, color: barData.close >= barData.open ? '#10b98180' : '#ef444480' };
        
        this.mainSeries.update(chartBar);
        this.volumeSeries.update(volumeBar);
    }
}

export const chartController = new ChartController(store);