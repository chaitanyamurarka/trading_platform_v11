// frontend_soa/src/chart/chart.options.js
export const getChartOptions = (theme) => {
    const isDark = theme === 'dark';
    return {
        layout: {
            background: { color: isDark ? '#1a1a1a' : '#ffffff' },
            textColor: isDark ? '#fff' : '#333',
        },
        grid: {
            vertLines: { color: isDark ? '#333' : '#e0e0e0' },
            horzLines: { color: isDark ? '#333' : '#e0e0e0' },
        },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        timeScale: { timeVisible: true, secondsVisible: true, borderColor: isDark ? '#333' : '#e0e0e0' },
    };
};