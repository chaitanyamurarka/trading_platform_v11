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

        // Time inputs
        startTimeInput: document.getElementById('start_time'),
        endTimeInput: document.getElementById('end_time'),

        // Modal buttons and modals
        indicatorModalBtn: document.getElementById('indicator-modal-btn'),
        settingsModalBtn: document.getElementById('settings-modal-btn'),
        settingsModal: document.getElementById('settings_modal'),

        // Indicator Modal
        indicatorModal: document.getElementById('indicator_modal'),
        indicatorApplyBtn: document.getElementById('indicator-apply-btn'),

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
    }
}