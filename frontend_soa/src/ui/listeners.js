// frontend_soa/src/ui/listeners.js
import { store } from '../state/store.js';
import { indicatorService } from '../services/indicator.service.js';

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
    safeAddListener(elements.timezoneSelect, 'change', (e) => store.set('selectedTimezone', e.target.value), 'timezoneSelect');
    safeAddListener(elements.candleTypeSelect, 'change', (e) => store.set('selectedCandleType', e.target.value), 'candleTypeSelect');
    safeAddListener(elements.chartTypeSelect, 'change', (e) => store.set('selectedChartType', e.target.value), 'chartTypeSelect');

    // Add these listeners
    safeAddListener(elements.startTimeInput, 'change', (e) => store.set('startTime', e.target.value), 'startTimeInput');
    safeAddListener(elements.endTimeInput, 'change', (e) => store.set('endTime', e.target.value), 'endTimeInput');

    // Live Mode Toggle
    safeAddListener(elements.liveToggle, 'change', (e) => store.set('isLiveMode', e.target.checked), 'liveToggle');
    
    // Theme Toggle
    safeAddListener(elements.themeToggle, 'change', (e) => {
        const newTheme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        store.set('theme', newTheme); // Update the store so other components can react
    }, 'themeToggle');
    
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

    console.log('UI Listeners Initialized');
}
