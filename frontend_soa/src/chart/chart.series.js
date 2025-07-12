// frontend_soa/src/chart/chart.series.js

export function createMainSeries(chart, type) {
    const seriesOptions = {
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
    });
}