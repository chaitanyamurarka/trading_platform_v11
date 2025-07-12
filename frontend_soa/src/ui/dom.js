// frontend_soa/src/ui/dom.js
let elementsCache = null;

export function getDomElements() {
    if (elementsCache) {
        return elementsCache;
    }

    elementsCache = {
        // Main layout
        chartContainer: document.getElementById('chart-container'),
        loadingIndicator: document.getElementById('loading-indicator'),
        
        // Controls
        exchangeSelect: document.getElementById('exchange'),
        symbolSelect: document.getElementById('symbol'),
        intervalSelect: document.getElementById('interval'),
        timezoneSelect: document.getElementById('timezone'),
        candleTypeSelect: document.getElementById('candle-type-select'),
        chartTypeSelect: document.getElementById('chart-type'),
        
        // Toggles & Buttons
        liveToggle: document.getElementById('live-toggle'),
        themeToggle: document.querySelector('#theme-toggle input'), // Get the checkbox itself
        screenshotBtn: document.getElementById('screenshot-btn'),

        // Regression Table
        regressionTableContainer: document.getElementById('regression-table-container'),
        regressionTable: document.getElementById('regression-table'),
        regressionTableHead: document.querySelector('#regression-table thead'),
        regressionTableBody: document.querySelector('#regression-table tbody'),
        removeRegressionBtn: document.getElementById('remove-regression-btn'),

        // Time inputs
        startTimeInput: document.getElementById('start_time'),
        endTimeInput: document.getElementById('end_time'),

        // Modal buttons and modals
        indicatorModalBtn: document.getElementById('indicator-modal-btn'),
        settingsModalBtn: document.getElementById('settings-modal-btn'),
        settingsModal: document.getElementById('settings_modal'),
        
        // Settings inputs
        gridColorInput: document.getElementById('setting-grid-color'),
        watermarkInput: document.getElementById('setting-watermark-text'),
        upColorInput: document.getElementById('setting-up-color'),
        downColorInput: document.getElementById('setting-down-color'),
        wickUpColorInput: document.getElementById('setting-wick-up-color'),
        wickDownColorInput: document.getElementById('setting-wick-down-color'),
        volUpColorInput: document.getElementById('setting-vol-up-color'),
        volDownColorInput: document.getElementById('setting-vol-down-color'),
        disableWicksInput: document.getElementById('setting-disable-wicks'),
        showOHLCLegendToggle: document.getElementById('setting-show-ohlc-legend'),

        // Indicator Modal
        indicatorModal: document.getElementById('indicator_modal'),
        indicatorApplyBtn: document.getElementById('indicator-apply-btn'),
        indicatorSelect: document.getElementById('indicator-select'),
        regressionLengthInput: document.getElementById('indicator-regression-length'),
        lookbackPeriodsInput: document.getElementById('indicator-lookback-periods'),
        timeframesContainer: document.getElementById('indicator-timeframes'),

        // Drawing toolbar elements (will be created dynamically)
        drawingToolbar: null, // Will be populated after toolbar creation
        
        // Data legend
        dataLegend: document.getElementById('data-legend'),
    };

    return elementsCache;
}

// Function to update elements cache after dynamic content is created
export function updateElementsCache() {
    if (elementsCache) {
        // Update drawing toolbar elements
        elementsCache.drawingToolbar = document.getElementById('drawing-toolbar');
        elementsCache.autoScaleBtn = document.getElementById('scaling-auto-btn');
        elementsCache.linearScaleBtn = document.getElementById('scaling-linear-btn');
        
        // Update any other dynamically created elements
        elementsCache.dataLegend = document.getElementById('data-legend');
        elementsCache.removeRegressionBtn = document.getElementById('remove-regression-btn');
    }
}