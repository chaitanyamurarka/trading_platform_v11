// frontend_soa/src/ui/listeners.js
import { store } from '../state/store.js';
import { indicatorService } from '../services/indicator.service.js';
import { chartController } from '../chart/chart.controller.js';
import { setAutomaticDateTime } from './helpers.js';

/**
 * Initializes all UI event listeners in a safe manner.
 * @param {object} elements - An object containing the DOM elements.
 */
export function initializeUiListeners(elements) {
    /**
     * A helper function to safely add an event listener to an element.
     * It checks if the element exists before adding the listener to prevent errors.
     * @param {HTMLElement} element - The DOM element to attach the listener to.
     * @param {string} event - The name of the event (e.g., 'change').
     * @param {Function} handler - The function to execute when the event fires.
     * @param {string} elementName - The name of the element for logging purposes.
     */
    const safeAddListener = (element, event, handler, elementName) => {
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`UI Listeners: Element '${elementName}' not found. Listener not attached.`);
        }
    };

    // Chart Parameter Listeners
    safeAddListener(elements.symbolSelect, 'change', (e) => store.set('selectedSymbol', e.target.value), 'symbolSelect');
    safeAddListener(elements.intervalSelect, 'change', (e) => store.set('selectedInterval', e.target.value), 'intervalSelect');
    safeAddListener(elements.candleTypeSelect, 'change', (e) => store.set('selectedCandleType', e.target.value), 'candleTypeSelect');
    safeAddListener(elements.chartTypeSelect, 'change', (e) => store.set('selectedChartType', e.target.value), 'chartTypeSelect');

    // NEW: Timezone listener with auto datetime update
    safeAddListener(elements.timezoneSelect, 'change', (e) => {
        const newTimezone = e.target.value;
        store.set('selectedTimezone', newTimezone);
        
        // Auto-update start and end times when timezone changes
        setAutomaticDateTime();
    }, 'timezoneSelect');

    // Time input listeners with store updates
    safeAddListener(elements.startTimeInput, 'change', (e) => {
        store.set('startTime', e.target.value);
    }, 'startTimeInput');
    
    safeAddListener(elements.endTimeInput, 'change', (e) => {
        store.set('endTime', e.target.value);
    }, 'endTimeInput');

    // NEW: Live Mode Toggle with auto datetime
    safeAddListener(elements.liveToggle, 'change', (e) => {
        const isLive = e.target.checked;
        
        if (isLive) {
            // Set automatic date/time when enabling live mode
            setAutomaticDateTime();
        }
        
        store.set('isLiveMode', isLive);
    }, 'liveToggle');
    
    // Theme Toggle with proper state management
    safeAddListener(elements.themeToggle, 'change', (e) => {
        const newTheme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        store.set('theme', newTheme);
    }, 'themeToggle');
    
    // NEW: Screenshot button
    safeAddListener(elements.screenshotBtn, 'click', () => {
        chartController.takeScreenshot();
    }, 'screenshotBtn');
    
    // Indicator Modal Apply Button
    safeAddListener(elements.indicatorApplyBtn, 'click', () => {
        const mockSettings = {
            length: 10,
            lookbackPeriods: [0, 1, 2, 3, 5],
            timeframes: ['1m', '5m', '15m']
        };
        indicatorService.runRegressionAnalysis(mockSettings);
        if (elements.indicatorModal && typeof elements.indicatorModal.close === 'function') {
            elements.indicatorModal.close();
        }
    }, 'indicatorApplyBtn');

    // Modal button listeners
    safeAddListener(elements.indicatorModalBtn, 'click', () => {
        if (elements.indicatorModal && typeof elements.indicatorModal.showModal === 'function') {
            elements.indicatorModal.showModal();
        }
    }, 'indicatorModalBtn');
    
    safeAddListener(elements.settingsModalBtn, 'click', () => {
        if (elements.settingsModal && typeof elements.settingsModal.showModal === 'function') {
            elements.settingsModal.showModal();
        }
    }, 'settingsModalBtn');

    // Initialize theme from localStorage on load
    initializeThemeFromStorage(elements);
    
    // Initialize automatic date/time on load
    setAutomaticDateTime();

    console.log('UI Listeners Initialized');
}

/**
 * Initializes theme from localStorage and syncs UI
 */
function initializeThemeFromStorage(elements) {
    const savedTheme = localStorage.getItem('chartTheme') || 'light';
    const isDark = savedTheme === 'dark';
    
    // Set document theme
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Sync theme toggle checkbox
    if (elements.themeToggle) {
        elements.themeToggle.checked = isDark;
    }
    
    // Update store
    store.set('theme', savedTheme);
}