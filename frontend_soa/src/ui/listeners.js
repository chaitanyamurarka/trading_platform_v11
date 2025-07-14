// frontend_soa/src/ui/listeners.js - Simplified to match frontend_services
import { store } from '../state/store.js';
import { indicatorService } from '../services/indicator.service.js';
import { chartController } from '../chart/chart.controller.js';
import { 
    setAutomaticDateTime, 
    showToast,
    populateSymbolSelect } from './helpers.js';
import { settingsManager } from './settings.js';
import { rangeControls } from './rangeControls.js';

export function initializeUiListeners(elements) {
    const safeAddListener = (element, event, handler, elementName) => {
        if (element) {
            element.addEventListener(event, handler);
            console.log(`✅ Listener attached: ${elementName}`);
        } else {
            console.warn(`⚠️ Element '${elementName}' not found.`);
        }
    };

    // Chart Parameter Listeners
    // Exchange selection listener
    safeAddListener(elements.exchangeSelect, 'change', (e) => {
        const newExchange = e.target.value;
        store.set('selectedExchange', newExchange);

        // Re-populate the symbols based on the newly selected exchange
        const allSymbols = store.get('availableSymbols');
        populateSymbolSelect(allSymbols, newExchange);
    }, 'exchangeSelect');
    safeAddListener(elements.symbolSelect, 'change', (e) => store.set('selectedSymbol', e.target.value), 'symbolSelect');
    safeAddListener(elements.intervalSelect, 'change', (e) => store.set('selectedInterval', e.target.value), 'intervalSelect');
    safeAddListener(elements.candleTypeSelect, 'change', (e) => store.set('selectedCandleType', e.target.value), 'candleTypeSelect');
    safeAddListener(elements.chartTypeSelect, 'change', (e) => store.set('selectedChartType', e.target.value), 'chartTypeSelect');

    // Timezone listener
    safeAddListener(elements.timezoneSelect, 'change', (e) => {
        const newTimezone = e.target.value;
        store.set('selectedTimezone', newTimezone);
        setAutomaticDateTime();
    }, 'timezoneSelect');

    // Time input listeners
    safeAddListener(elements.startTimeInput, 'change', (e) => {
        store.set('startTime', e.target.value);
    }, 'startTimeInput');
    
    safeAddListener(elements.endTimeInput, 'change', (e) => {
        store.set('endTime', e.target.value);
    }, 'endTimeInput');

    // Live Mode Toggle
    safeAddListener(elements.liveToggle, 'change', (e) => {
        const isLive = e.target.checked;
        if (isLive) {
            setAutomaticDateTime();
        }
        store.set('isLiveMode', isLive);
    }, 'liveToggle');
    
    // Theme Toggle
    safeAddListener(elements.themeToggle, 'change', (e) => {
        const newTheme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        store.set('theme', newTheme);
    }, 'themeToggle');
    
    // Screenshot button
    safeAddListener(elements.screenshotBtn, 'click', () => {
        chartController.takeScreenshot();
    }, 'screenshotBtn');
    
    // Remove Regression button
    safeAddListener(elements.removeRegressionBtn, 'click', () => {
        indicatorService.removeRegressionAnalysis();
    }, 'removeRegressionBtn');
    
    // Indicator Modal Apply Button
    safeAddListener(elements.indicatorApplyBtn, 'click', () => {
        const length = parseInt(elements.regressionLengthInput?.value || '10', 10);
        
        let lookbackPeriods;
        try {
            lookbackPeriods = rangeControls.getLookbackPeriods();
        } catch (error) {
            lookbackPeriods = elements.lookbackPeriodsInput?.value?.split(',').map(p => parseInt(p.trim(), 10)) || [0, 1, 2, 3, 5];
        }
        
        const timeframeCheckboxes = elements.timeframesContainer?.querySelectorAll('input[type="checkbox"]:checked');
        const timeframes = timeframeCheckboxes ? Array.from(timeframeCheckboxes).map(cb => cb.value) : ['1m', '5m', '15m'];
        
        // Get the state of the live updates toggle
        const enableLive = document.getElementById('enable-live-regression')?.checked || false;

        if (isNaN(length) || length < 2) {
            showToast('Regression Length must be at least 2.', 'error');
            return;
        }
        
        if (!lookbackPeriods || lookbackPeriods.length === 0) {
            showToast('Please specify at least one lookback period.', 'error');
            return;
        }
        
        if (timeframes.length === 0) {
            showToast('Please select at least one timeframe.', 'error');
            return;
        }
        
        const settings = { length, lookbackPeriods, timeframes, enableLive }; // Add enableLive to settings
        indicatorService.runRegressionAnalysis(settings);
        
        // Close modal
        const modal = document.getElementById('indicator_modal');
        if (modal && modal.close) {
            modal.close();
        }
    }, 'indicatorApplyBtn');

    // Modal button listeners - simplified
    safeAddListener(elements.indicatorModalBtn, 'click', () => {
        const modal = document.getElementById('indicator_modal');
        if (modal && modal.showModal) {
            modal.showModal();
            // Initialize range controls when modal opens
            setTimeout(() => rangeControls.initialize(), 100);
        }
    }, 'indicatorModalBtn');
    
    safeAddListener(elements.settingsModalBtn, 'click', () => {
        const modal = document.getElementById('settings_modal');
        if (modal && modal.showModal) {
            modal.showModal();
            // Initialize settings when modal opens
            setTimeout(() => settingsManager.initialize(), 100);
        }
    }, 'settingsModalBtn');

    // Initialize theme from localStorage
    initializeThemeFromStorage(elements);
    
    // Initialize automatic date/time
    setAutomaticDateTime();

    console.log('✅ UI Listeners Initialized');
}

function initializeThemeFromStorage(elements) {
    const savedTheme = localStorage.getItem('chartTheme') || 'light';
    const isDark = savedTheme === 'dark';
    
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    if (elements.themeToggle) {
        elements.themeToggle.checked = isDark;
    }
    
    store.set('theme', savedTheme);
}