// frontend_soa/src/chart/chart.options.js
export const getChartOptions = (theme) => {
    const isDark = theme === 'dark';
    const gridColor = isDark ? '#333' : '#e0e0e0';
    const textColor = isDark ? '#fff' : '#333';
    
    return {
        layout: {
            background: { color: isDark ? '#1a1a1a' : '#ffffff' },
            textColor: textColor,
        },
        grid: {
            vertLines: { color: gridColor },
            horzLines: { color: gridColor },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: gridColor,
            autoScale: true,
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: true,
            borderColor: gridColor,
            // Prevent automatic shifting to keep initial view stable
            shiftVisibleRangeOnNewBar: false,
        },
        watermark: {
            color: 'rgba(150, 150, 150, 0.2)',
            visible: true,
            text: 'EigenKor SOA',
            fontSize: 48,
            horzAlign: 'center',
            vertAlign: 'center',
        }
    };
};