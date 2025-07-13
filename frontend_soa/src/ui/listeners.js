// frontend_soa/src/ui/listeners.js - Enhanced with settings modal debugging
import { store } from '../state/store.js';
import { indicatorService } from '../services/indicator.service.js';
import { chartController } from '../chart/chart.controller.js';
import { setAutomaticDateTime, showToast } from './helpers.js';
import { settingsManager } from './settings.js';
import { rangeControls } from './rangeControls.js';

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
    
    // Indicator Modal Apply Button - Updated to use range controls
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
            // Fallback to comma-separated input if range controls fail
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
        
        // Close modal safely
        const modal = document.getElementById('indicator_modal');
        if (modal && typeof modal.close === 'function') {
            modal.close();
        }
    }, 'indicatorApplyBtn');

    // Modal button listeners with enhanced debugging
    safeAddListener(elements.indicatorModalBtn, 'click', () => {
        console.log('🔄 Opening indicator modal...');
        
        // Get fresh reference to modal (in case it was replaced)
        const modal = document.getElementById('indicator_modal');
        if (modal) {
            console.log('✅ Modal found, showing...');
            
            try {
                modal.showModal();
                console.log('✅ Modal shown successfully');
                
                // Initialize range controls when modal opens
                setTimeout(() => {
                    console.log('🔄 Initializing range controls...');
                    rangeControls.initialize();
                }, 100);
                
            } catch (error) {
                console.error('❌ Failed to show modal:', error);
                showToast('Failed to open indicator modal', 'error');
            }
        } else {
            console.error('❌ Indicator modal not found in DOM');
            showToast('Indicator modal not found', 'error');
        }
    }, 'indicatorModalBtn');
    
    // ENHANCED: Settings modal with comprehensive debugging
    safeAddListener(elements.settingsModalBtn, 'click', () => {
        console.log('🔄 Opening settings modal...');
        
        // Get fresh reference to modal
        const modal = document.getElementById('settings_modal');
        if (modal) {
            console.log('✅ Settings modal found, showing...');
            
            try {
                // Debug modal state before opening
                debugModalState(modal);
                
                // Force modal visibility BEFORE showing
                forceModalVisibility(modal);
                
                // Try to show modal
                modal.showModal();
                console.log('✅ Settings modal shown successfully');
                
                // Force visibility again after showing
                setTimeout(() => {
                    forceModalVisibility(modal);
                    console.log('🔄 Initializing settings manager...');
                    settingsManager.initialize();
                    
                    // Additional debugging
                    setTimeout(() => {
                        debugModalState(modal);
                        settingsManager.forceVisible();
                    }, 200);
                }, 100);
                
            } catch (error) {
                console.error('❌ Failed to show settings modal:', error);
                showToast('Failed to open settings modal', 'error');
                
                // Try alternative approach
                alternativeModalOpen(modal);
            }
        } else {
            console.error('❌ Settings modal not found in DOM');
            showToast('Settings modal not found', 'error');
        }
    }, 'settingsModalBtn');

    // Initialize theme from localStorage on load
    initializeThemeFromStorage(elements);
    
    // Initialize automatic date/time on load
    setAutomaticDateTime();

    console.log('✅ UI Listeners Initialized');
}

/**
 * Enhanced modal debugging function
 */
function debugModalState(modal) {
    console.group('🔍 Modal Debug State');
    
    if (!modal) {
        console.error('❌ Modal is null/undefined');
        console.groupEnd();
        return;
    }
    
    console.log('📋 Modal element:', modal);
    console.log('📋 Modal ID:', modal.id);
    console.log('📋 Modal classes:', modal.className);
    console.log('📋 Modal open attribute:', modal.hasAttribute('open'));
    console.log('📋 Modal open property:', modal.open);
    
    const styles = window.getComputedStyle(modal);
    console.log('🎨 Computed styles:', {
        display: styles.display,
        visibility: styles.visibility,
        opacity: styles.opacity,
        zIndex: styles.zIndex,
        position: styles.position,
        backgroundColor: styles.backgroundColor,
        width: styles.width,
        height: styles.height
    });
    
    const modalBox = modal.querySelector('.modal-box');
    if (modalBox) {
        const boxStyles = window.getComputedStyle(modalBox);
        console.log('📦 Modal box styles:', {
            display: boxStyles.display,
            visibility: boxStyles.visibility,
            opacity: boxStyles.opacity,
            backgroundColor: boxStyles.backgroundColor,
            color: boxStyles.color,
            transform: boxStyles.transform,
            width: boxStyles.width,
            height: boxStyles.height
        });
    } else {
        console.error('❌ Modal box not found');
    }
    
    console.groupEnd();
}

/**
 * Force modal visibility with strong CSS overrides
 */
function forceModalVisibility(modal) {
    if (!modal) return;
    
    console.log('🔧 Forcing modal visibility...');
    
    // Remove any conflicting classes
    modal.classList.remove('hidden', 'invisible');
    
    // Force modal visibility with !important styles
    modal.style.cssText = `
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        z-index: 9999 !important;
        position: fixed !important;
        inset: 0 !important;
        background: rgba(0, 0, 0, 0.7) !important;
        align-items: center !important;
        justify-content: center !important;
        backdrop-filter: blur(4px) !important;
        animation: none !important;
        transform: none !important;
    `;
    
    const modalBox = modal.querySelector('.modal-box');
    if (modalBox) {
        modalBox.style.cssText = `
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            background: #1f2937 !important;
            color: #ffffff !important;
            padding: 2rem !important;
            border-radius: 0.75rem !important;
            border: 3px solid #3b82f6 !important;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
            transform: none !important;
            max-width: 32rem !important;
            width: 90vw !important;
            max-height: 80vh !important;
            overflow-y: auto !important;
            position: relative !important;
            z-index: 10000 !important;
            animation: none !important;
        `;
    }
    
    // Ensure modal title is visible
    const title = modal.querySelector('h3');
    if (title) {
        title.style.cssText = `
            color: #ffffff !important;
            font-size: 1.5rem !important;
            font-weight: 700 !important;
            margin-bottom: 1.5rem !important;
            text-align: center !important;
        `;
    }
    
    console.log('✅ Modal visibility forced with strong CSS');
}

/**
 * Alternative modal opening method
 */
function alternativeModalOpen(modal) {
    console.log('🔄 Trying alternative modal opening method...');
    
    // Set the open attribute manually
    modal.setAttribute('open', '');
    modal.open = true;
    
    // Force visibility
    forceModalVisibility(modal);
    
    // Initialize settings after a delay
    setTimeout(() => {
        settingsManager.initialize();
        settingsManager.forceVisible();
    }, 500);
    
    console.log('✅ Alternative modal opening attempted');
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