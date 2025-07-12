// frontend_soa/src/chart/chart.series.js
import { store } from '../state/store.js';

export function createMainSeries(chart, type) {
    const customColors = store.get('seriesColors');
    const seriesOptions = customColors || {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderDownColor: '#ef4444',
        borderUpColor: '#10b981',
        wickDownColor: '#ef4444',
        wickUpColor: '#10b981',
    };
    
    switch (type) {
        case 'bar':
            return chart.addBarSeries(seriesOptions);
        case 'line':
            return chart.addLineSeries({ 
                color: seriesOptions.upColor,
                lineWidth: 2 
            });
        case 'area':
            return chart.addAreaSeries({ 
                lineColor: seriesOptions.upColor, 
                topColor: `${seriesOptions.upColor}66`, 
                bottomColor: `${seriesOptions.upColor}00`,
                lineWidth: 2
            });
        case 'candlestick':
        default:
            return chart.addCandlestickSeries(seriesOptions);
    }
}

export function createVolumeSeries(chart) {
    return chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '', // Render on its own scale
        scaleMargins: { top: 0.8, bottom: 0 },
        color: '#26a69a80'
    });
}