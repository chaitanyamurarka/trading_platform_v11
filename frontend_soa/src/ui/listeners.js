// frontend_soa/src/ui/listeners.js
import { store } from '../state/store.js';
import { indicatorService } from '../services/indicator.service.js';
import { chartController } from '../chart/chart.controller.js';
import { setAutomaticDateTime, showToast } from './helpers.js';

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

    // Timezone listener with auto datetime update
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

    // Live Mode Toggle with auto datetime
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
        // Get values from form
        const length = parseInt(elements.regressionLengthInput?.value || '10', 10);
        const lookbackPeriods = elements.lookbackPeriodsInput?.value?.split(',').map(p => parseInt(p.trim(), 10)) || [0, 1, 2, 3, 5];
        
        // Get selected timeframes
        const timeframeCheckboxes = elements.timeframesContainer?.querySelectorAll('input[type="checkbox"]:checked');
        const timeframes = timeframeCheckboxes ? Array.from(timeframeCheckboxes).map(cb => cb.value) : ['1m', '5m', '15m'];
        
        const settings = {
            length,
            lookbackPeriods,
            timeframes
        };
        
        indicatorService.runRegressionAnalysis(settings);
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

    // Setup settings listeners
    setupSettingsListeners(elements, store, chartController);

    // Initialize theme from localStorage on load
    initializeThemeFromStorage(elements);
    
    // Initialize automatic date/time on load
    setAutomaticDateTime();

    console.log('UI Listeners Initialized');
}

/**
 * Sets up all settings modal listeners
 */
function setupSettingsListeners(elements, store, chartController) {
    // Tab switching - Fixed version
    const settingsModal = elements.settingsModal;
    if (settingsModal) {
        const tabButtons = settingsModal.querySelectorAll('.tabs .tab');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                
                // Remove active class from all tabs
                tabButtons.forEach(tab => tab.classList.remove('tab-active'));
                
                // Add active class to clicked tab
                button.classList.add('tab-active');
                
                // Hide all tab contents
                const allContents = settingsModal.querySelectorAll('.tab-content');
                allContents.forEach(content => content.classList.add('hidden'));
                
                // Show the selected tab content
                const targetId = button.getAttribute('data-tab');
                const targetContent = document.getElementById(targetId);
                if (targetContent) {
                    targetContent.classList.remove('hidden');
                }
            });
        });
    }

    // Initialize default colors
    const initializeColors = () => {
        const isDark = store.get('theme') === 'dark';
        
        // Set default grid color based on theme
        if (elements.gridColorInput && !elements.gridColorInput.value) {
            elements.gridColorInput.value = isDark ? '#333333' : '#e0e0e0';
        }
    };
    
    // Call initialization
    initializeColors();
    
    // Store subscription for theme changes
    store.subscribe('theme', () => {
        initializeColors();
    });

    // Grid color
    if (elements.gridColorInput) {
        elements.gridColorInput.addEventListener('input', (e) => {
            const chart = chartController.getChart();
            if (chart) {
                chart.applyOptions({
                    grid: {
                        vertLines: { color: e.target.value },
                        horzLines: { color: e.target.value }
                    }
                });
            }
        });
    }

    // Watermark text
    if (elements.watermarkInput) {
        elements.watermarkInput.addEventListener('input', (e) => {
            const chart = chartController.getChart();
            if (chart) {
                chart.applyOptions({
                    watermark: { text: e.target.value }
                });
            }
        });
    }

    // Series colors
    const applySeriesColors = () => {
        store.set('seriesColors', {
            upColor: elements.upColorInput?.value || '#10b981',
            downColor: elements.downColorInput?.value || '#ef4444',
            wickUpColor: elements.disableWicksInput?.checked ? 'rgba(0,0,0,0)' : (elements.wickUpColorInput?.value || '#10b981'),
            wickDownColor: elements.disableWicksInput?.checked ? 'rgba(0,0,0,0)' : (elements.wickDownColorInput?.value || '#ef4444'),
            borderUpColor: elements.upColorInput?.value || '#10b981',
            borderDownColor: elements.downColorInput?.value || '#ef4444',
        });
        
        // Recreate series to apply new colors
        const chartType = store.get('selectedChartType');
        chartController.recreateMainSeries(chartType);
    };

    [elements.upColorInput, elements.downColorInput, elements.wickUpColorInput, elements.wickDownColorInput, elements.disableWicksInput].forEach(input => {
        if (input) {
            input.addEventListener('change', applySeriesColors);
        }
    });

    // Volume colors
    const applyVolumeColors = () => {
        const volumeData = store.get('volumeData');
        const chartData = store.get('chartData');
        
        if (!volumeData || !chartData || !chartController.getVolumeSeries()) return;

        const priceActionMap = new Map();
        chartData.forEach(priceData => {
            priceActionMap.set(priceData.time, priceData.close >= priceData.open);
        });

        const newVolumeData = volumeData.map(volumeData => ({
            ...volumeData,
            color: priceActionMap.get(volumeData.time) 
                ? (elements.volUpColorInput?.value || '#10b981') + '80' 
                : (elements.volDownColorInput?.value || '#ef4444') + '80',
        }));

        store.set('volumeData', newVolumeData);
    };

    [elements.volUpColorInput, elements.volDownColorInput].forEach(input => {
        if (input) {
            input.addEventListener('change', applyVolumeColors);
        }
    });

    // Show OHLC Legend toggle
    if (elements.showOHLCLegendToggle) {
        elements.showOHLCLegendToggle.addEventListener('change', (e) => {
            store.set('showOHLCLegend', e.target.checked);
            const dataLegend = document.getElementById('data-legend');
            if (dataLegend && !e.target.checked) {
                dataLegend.style.display = 'none';
            } else if (dataLegend && e.target.checked) {
                // Force update to show latest values
                chartController.showLatestOHLCValues();
            }
        });
    }
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