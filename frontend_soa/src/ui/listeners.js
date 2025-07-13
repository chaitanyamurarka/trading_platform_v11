// frontend_soa/src/ui/listeners.js - Updated with modal manager for proper close functionality
import { store } from '../state/store.js';
import { indicatorService } from '../services/indicator.service.js';
import { chartController } from '../chart/chart.controller.js';
import { setAutomaticDateTime, showToast } from './helpers.js';
import { settingsManager } from './settings.js';
import { rangeControls } from './rangeControls.js';
import { modalManager, openModal, closeModal } from './modalManager.js';

/**
 * Initializes all UI event listeners in a safe manner.
 * @param {object} elements - An object containing the DOM elements.
 */
export function initializeUiListeners(elements) {
    /**
     * A helper function to safely add an event listener to an element.
     */
    const safeAddListener = (element, event, handler, elementName) => {
        if (element) {
            element.addEventListener(event, handler);
            console.log(`✅ Listener attached: ${elementName}`);
        } else {
            console.warn(`⚠️ UI Listeners: Element '${elementName}' not found. Listener not attached.`);
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
        console.log('🔄 Apply button clicked');
        
        // Get values from form
        const length = parseInt(elements.regressionLengthInput?.value || '10', 10);
        
        // Try to get lookback periods from range controls first
        let lookbackPeriods;
        try {
            lookbackPeriods = rangeControls.getLookbackPeriods();
            console.log('📊 Lookback periods from range controls:', lookbackPeriods);
        } catch (error) {
            console.warn('⚠️ Range controls failed, using fallback:', error);
            lookbackPeriods = elements.lookbackPeriodsInput?.value?.split(',').map(p => parseInt(p.trim(), 10)) || [0, 1, 2, 3, 5];
        }
        
        // Get selected timeframes
        const timeframeCheckboxes = elements.timeframesContainer?.querySelectorAll('input[type="checkbox"]:checked');
        const timeframes = timeframeCheckboxes ? Array.from(timeframeCheckboxes).map(cb => cb.value) : ['1m', '5m', '15m'];
        
        // Validation
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
        
        const settings = {
            length,
            lookbackPeriods,
            timeframes
        };
        
        console.log('🚀 Running regression analysis with settings:', settings);
        indicatorService.runRegressionAnalysis(settings);
        
        // Close modal using modal manager
        closeModal('indicator_modal');
    }, 'indicatorApplyBtn');

    // FIXED: Modal button listeners using modal manager
    safeAddListener(elements.indicatorModalBtn, 'click', () => {
        console.log('🔄 Opening indicator modal...');
        
        const success = openModal('indicator_modal');
        if (success) {
            // Initialize range controls when modal opens
            setTimeout(() => {
                console.log('🔄 Initializing range controls...');
                rangeControls.initialize();
            }, 100);
        } else {
            showToast('Failed to open indicator modal', 'error');
        }
    }, 'indicatorModalBtn');
    
    // FIXED: Settings modal using modal manager
    safeAddListener(elements.settingsModalBtn, 'click', () => {
        console.log('🔄 Opening settings modal...');
        
        const success = openModal('settings_modal');
        if (success) {
            // Initialize settings when modal opens
            setTimeout(() => {
                console.log('🔄 Initializing settings manager...');
                settingsManager.initialize();
            }, 100);
        } else {
            showToast('Failed to open settings modal', 'error');
        }
    }, 'settingsModalBtn');

    // Setup manual close button handlers for better reliability
    setupManualCloseHandlers();

    // Initialize theme from localStorage on load
    initializeThemeFromStorage(elements);
    
    // Initialize automatic date/time on load
    setAutomaticDateTime();

    console.log('✅ UI Listeners Initialized');
}

/**
 * Setup manual close button handlers as backup
 */
function setupManualCloseHandlers() {
    // Settings modal close handlers
    const settingsModal = document.getElementById('settings_modal');
    if (settingsModal) {
        // Close button in modal action
        const settingsCloseBtn = settingsModal.querySelector('.modal-action .btn, .modal-action button');
        if (settingsCloseBtn) {
            settingsCloseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔘 Settings close button clicked');
                closeModal('settings_modal');
            });
        }

        // Backdrop click
        const settingsBackdrop = settingsModal.querySelector('.modal-backdrop');
        if (settingsBackdrop) {
            settingsBackdrop.addEventListener('click', (e) => {
                if (e.target === settingsBackdrop) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔘 Settings backdrop clicked');
                    closeModal('settings_modal');
                }
            });
        }
    }

    // Indicator modal close handlers
    const indicatorModal = document.getElementById('indicator_modal');
    if (indicatorModal) {
        // Close button in modal action
        const indicatorCloseBtn = indicatorModal.querySelector('.modal-action .btn:not(.btn-primary), .modal-action button:not(.btn-primary)');
        if (indicatorCloseBtn) {
            indicatorCloseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔘 Indicator close button clicked');
                closeModal('indicator_modal');
            });
        }

        // Backdrop click
        const indicatorBackdrop = indicatorModal.querySelector('.modal-backdrop');
        if (indicatorBackdrop) {
            indicatorBackdrop.addEventListener('click', (e) => {
                if (e.target === indicatorBackdrop) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔘 Indicator backdrop clicked');
                    closeModal('indicator_modal');
                }
            });
        }
    }

    // Global ESC key handler
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const openModals = modalManager.getOpenModals();
            if (openModals.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                console.log('⌨️ ESC pressed, closing modal:', openModals[openModals.length - 1]);
                closeModal(openModals[openModals.length - 1]); // Close the last opened modal
            }
        }
    });

    console.log('✅ Manual close handlers setup');
}

/**
 * Initializes theme from localStorage and syncs UI
 */
function initializeThemeFromStorage(elements) {
    const savedTheme = localStorage.getItem('chartTheme') || 'light';
    const isDark = savedTheme === 'dark';
    
    console.log(`🎨 Initializing theme: ${savedTheme}`);
    
    // Set document theme
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Sync theme toggle checkbox
    if (elements.themeToggle) {
        elements.themeToggle.checked = isDark;
        console.log('✅ Theme toggle synced');
    }
    
    // Update store
    store.set('theme', savedTheme);
}