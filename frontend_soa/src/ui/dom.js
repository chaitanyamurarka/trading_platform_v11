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

        // Indicator Modal
        indicatorModal: document.getElementById('indicator_modal'),
        indicatorApplyBtn: document.getElementById('indicator-apply-btn'),
        // Add other indicator form elements here if needed...
    };

    return elementsCache;
}