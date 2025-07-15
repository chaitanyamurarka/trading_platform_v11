// frontend_soa/src/ui/dom.js - Updated to remove gridColorInput
let elementsCache = null;

export function getDomElements() {
    // Always refresh cache to handle dynamically created elements
    elementsCache = {
        // Main layout
        chartContainer: document.getElementById('chart-container'),
        loadingIndicator: document.getElementById('loading-indicator'),
        sidebar: document.getElementById('sidebar'),
        sidebarOverlay: document.getElementById('sidebar-overlay'),
        menuToggle: document.getElementById('menu-toggle'),
        
        // Controls
        exchangeSelect: document.getElementById('exchange'),
        symbolSelect: document.getElementById('symbol'),
        intervalSelect: document.getElementById('interval'),
        timezoneSelect: document.getElementById('timezone'),
        candleTypeSelect: document.getElementById('candle-type-select'),
        chartTypeSelect: document.getElementById('chart-type'),
        
        // Toggles & Buttons
        liveToggle: document.getElementById('live-toggle'),
        themeToggle: document.querySelector('#theme-toggle input[type="checkbox"]'),
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
        indicatorModal: document.getElementById('indicator_modal'),
        
        // Settings inputs - REMOVED gridColorInput
        watermarkInput: document.getElementById('setting-watermark-text'),
        upColorInput: document.getElementById('setting-up-color'),
        downColorInput: document.getElementById('setting-down-color'),
        wickUpColorInput: document.getElementById('setting-wick-up-color'),
        wickDownColorInput: document.getElementById('setting-wick-down-color'),
        volUpColorInput: document.getElementById('setting-vol-up-color'),
        volDownColorInput: document.getElementById('setting-vol-down-color'),
        disableWicksInput: document.getElementById('setting-disable-wicks'),
        showOHLCLegendToggle: document.getElementById('setting-show-ohlc-legend'),

        // Indicator inputs
        indicatorApplyBtn: document.getElementById('indicator-apply-btn'),
        indicatorSelect: document.getElementById('indicator-select'),
        regressionLengthInput: document.getElementById('indicator-regression-length'),
        lookbackPeriodsInput: document.getElementById('indicator-lookback-periods'),
        timeframesContainer: document.getElementById('indicator-timeframes'),

        // Range control elements
        minLookbackSlider: document.getElementById('min-lookback-slider'),
        minLookbackInput: document.getElementById('min-lookback-input'),
        maxLookbackSlider: document.getElementById('max-lookback-slider'),
        maxLookbackInput: document.getElementById('max-lookback-input'),
        stepSizeSlider: document.getElementById('step-size-slider'),
        stepSizeInput: document.getElementById('step-size-input'),
        lookbackPreview: document.getElementById('lookback-preview'),
        periodCount: document.getElementById('period-count'),

        // Drawing toolbar elements
        drawingToolbar: document.getElementById('drawing-toolbar'),
        autoScaleBtn: document.getElementById('scaling-auto-btn'),
        linearScaleBtn: document.getElementById('scaling-linear-btn'),
        
        // Data legend
        dataLegend: document.getElementById('data-legend'),
    };

    return elementsCache;
}

// Function to update elements cache after dynamic content is created
export function updateElementsCache() {
    // Force refresh by setting cache to null
    elementsCache = null;
    return getDomElements();
}

// Helper function to wait for an element to exist
export function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver((mutations, obs) => {
            const element = document.querySelector(selector);
            if (element) {
                obs.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Timeout after specified time
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
    });
}

// Helper function to check if element exists and is connected to DOM
export function isElementValid(element) {
    return element && element.isConnected && document.contains(element);
}

// Helper function to get element safely with fallback
export function getElementSafely(id, fallbackSelector = null) {
    let element = document.getElementById(id);
    
    if (!element && fallbackSelector) {
        element = document.querySelector(fallbackSelector);
    }
    
    if (!element) {
        console.warn(`⚠️ Element not found: ${id}${fallbackSelector ? ` or ${fallbackSelector}` : ''}`);
    }
    
    return element;
}