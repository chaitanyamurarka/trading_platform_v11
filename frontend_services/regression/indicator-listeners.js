// frontend/src/utils/indicator-listeners.js
import { getDomElements } from '../main/dom-elements.js';

const elements = getDomElements();
import { state } from '../chart/state.js';
import { 
    runRegressionAnalysis, 
    removeRegressionAnalysis,
    handleLiveModeToggle,
    handleSymbolChangeForLiveRegression,
    toggleLiveRegression
} from '../regression/indicator-service.js';

import { initializeRegressionRangeControls, applyRegressionPreset } from '../regression/regression-range-controls.js';

export function setupIndicatorListeners() {
    // Existing Apply button listener
    if (elements.indicatorApplyBtn) {
        elements.indicatorApplyBtn.addEventListener('click', runRegressionAnalysis);
    }

    // Modal Remove button listener
    if (elements.indicatorRemoveBtn) {
        elements.indicatorRemoveBtn.addEventListener('click', removeRegressionAnalysis);
    }

    // Table Remove button listener
    if (elements.removeRegressionBtn) {
        elements.removeRegressionBtn.addEventListener('click', removeRegressionAnalysis);
    }

    // NEW: Live mode toggle listener for regression
    if (elements.liveToggle) {
        elements.liveToggle.addEventListener('change', (event) => {
            const isLive = event.target.checked;
            
            // Handle live regression connection/disconnection
            handleLiveModeToggle(isLive);
        });
    }

    // Auto-update indicator when symbol changes
    if (elements.symbolSelect) {
        elements.symbolSelect.addEventListener('change', (event) => {
            const newSymbol = event.target.value;
            handleSymbolChangeForLiveRegression(newSymbol);
        });
    }

    const rangeControlsAvailable = initializeRegressionRangeControls();
    
    if (rangeControlsAvailable) {
        console.log('Using enhanced min/max range controls');
        // Add preset button listeners
        setupPresetButtons();
    } else {
        console.log('Using legacy comma-separated input');
    }

    // NEW: Add a manual toggle button for live regression (optional)
    setupLiveRegressionToggleButton();

    // NEW: Add keyboard shortcuts for regression controls
    setupRegressionKeyboardShortcuts();

    // NEW: Add custom event listeners for live regression updates
    setupLiveRegressionEventListeners();
}

/**
 * NEW: Sets up a manual toggle button for live regression
 */
function setupLiveRegressionToggleButton() {
    // Create a toggle button dynamically if it doesn't exist
    let liveRegressionToggle = document.getElementById('live-regression-toggle');
    
    if (!liveRegressionToggle && elements.regressionTableContainer) {
        // Create the toggle button and add it to the regression table header
        const headerDiv = elements.regressionTableContainer.querySelector('.flex.items-center.gap-2.mb-2.px-2');
        if (headerDiv) {
            liveRegressionToggle = document.createElement('button');
            liveRegressionToggle.id = 'live-regression-toggle';
            liveRegressionToggle.className = 'btn btn-xs btn-outline btn-success';
            liveRegressionToggle.title = 'Toggle Live Regression';
            liveRegressionToggle.innerHTML = '<i class="fas fa-wifi"></i> Live';
            
            // Insert before the remove button
            headerDiv.insertBefore(liveRegressionToggle, elements.removeRegressionBtn);
        }
    }
    
    if (liveRegressionToggle) {
        liveRegressionToggle.addEventListener('click', toggleLiveRegression);
    }
}

/**
 * NEW: Sets up keyboard shortcuts for regression controls
 */
function setupRegressionKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // Only handle shortcuts when not typing in input fields
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        // Ctrl+R: Run regression analysis
        if (event.ctrlKey && event.key === 'i') {
            event.preventDefault();
            if (state.isIndicatorActive) {
                runRegressionAnalysis();
            } else {
                // Open the indicator modal if regression is not active
                if (elements.indicatorModal) {
                    elements.indicatorModal.showModal();
                }
            }
        }

        // Ctrl+Shift+R: Remove regression analysis
        if (event.ctrlKey && event.key === 'q') {
            event.preventDefault();
            if (state.isIndicatorActive) {
                removeRegressionAnalysis();
            }
        }

        // Ctrl+L: Toggle live regression
        if (event.ctrlKey && event.key === 'l') {
            event.preventDefault();
            toggleLiveRegression();
        }
    });
}

/**
 * NEW: Sets up custom event listeners for live regression updates
 */
function setupLiveRegressionEventListeners() {
    // Listen for live regression updates from the WebSocket service
    window.addEventListener('liveRegressionUpdate', (event) => {
        const data = event.detail;
        console.log('Live regression update received in listeners:', data);
        
        // Update any additional UI elements that might depend on live regression data
        updateLiveRegressionIndicators(data);
        
        // Dispatch to other components that might be interested
        updateRegressionRelatedChartElements(data);
    });

    // Listen for live regression connection status changes
    window.addEventListener('liveRegressionConnectionChange', (event) => {
        const { connected, symbol } = event.detail;
        updateLiveRegressionUI(connected, symbol);
    });
}

/**
 * NEW: Updates UI indicators for live regression status
 */
function updateLiveRegressionIndicators(data) {
    // Update the live regression toggle button state
    const liveRegressionToggle = document.getElementById('live-regression-toggle');
    if (liveRegressionToggle) {
        liveRegressionToggle.classList.add('btn-success');
        liveRegressionToggle.classList.remove('btn-outline');
        
        // Add pulsing animation to indicate live updates
        liveRegressionToggle.style.animation = 'pulse 0.5s ease-in-out';
        setTimeout(() => {
            if (liveRegressionToggle) {
                liveRegressionToggle.style.animation = '';
            }
        }, 500);
    }

    // Update timestamp in the table header
    const header = elements.regressionTableContainer?.querySelector('h3');
    if (header) {
        const timestamp = new Date(data.timestamp).toLocaleTimeString();
        header.setAttribute('title', `Last update: ${timestamp}`);
    }
}

/**
 * NEW: Updates live regression UI state
 */
function updateLiveRegressionUI(connected, symbol) {
    const liveRegressionToggle = document.getElementById('live-regression-toggle');
    if (liveRegressionToggle) {
        if (connected) {
            liveRegressionToggle.classList.add('btn-success');
            liveRegressionToggle.classList.remove('btn-outline');
            liveRegressionToggle.title = `Live Regression Active for ${symbol}`;
        } else {
            liveRegressionToggle.classList.remove('btn-success');
            liveRegressionToggle.classList.add('btn-outline');
            liveRegressionToggle.title = 'Toggle Live Regression';
        }
    }
}

/**
 * NEW: Updates chart elements related to regression data
 */
function updateRegressionRelatedChartElements(data) {
    // This function can be expanded to add regression lines or indicators to the chart
    // For now, it's a placeholder for future chart integration
    
    // Example: You could add trend lines based on regression slopes
    // or highlight certain time periods based on R-values
    
    console.log('Regression data available for chart integration:', {
        symbol: data.symbol,
        timeframe: data.timeframe,
        results: data.results
    });
}

/**
 * NEW: Validates regression settings before applying
 */
export function validateRegressionSettings() {
    const regressionLength = parseInt(elements.regressionLengthInput?.value, 10);
    const lookbackPeriods = elements.lookbackPeriodsInput?.value;
    const selectedTimeframes = elements.timeframesContainer?.querySelectorAll('input[type="checkbox"]:checked');

    const errors = [];

    if (isNaN(regressionLength) || regressionLength < 2) {
        errors.push('Regression Length must be at least 2');
    }

    if (regressionLength > 1000) {
        errors.push('Regression Length cannot exceed 1000');
    }

    if (!lookbackPeriods || lookbackPeriods.trim() === '') {
        errors.push('Lookback Periods cannot be empty');
    }

    if (!selectedTimeframes || selectedTimeframes.length === 0) {
        errors.push('At least one timeframe must be selected');
    }

    try {
        const periods = lookbackPeriods.split(',').map(p => parseInt(p.trim(), 10));
        if (periods.some(p => isNaN(p) || p < 0)) {
            errors.push('All lookback periods must be non-negative integers');
        }
    } catch (e) {
        errors.push('Invalid format for lookback periods');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * NEW: Shows validation errors to the user
 */
export function showValidationErrors(errors) {
    if (!errors || errors.length === 0) return;
    
    const errorMessage = errors.join(', ');
    showToast(`Validation Error: ${errorMessage}`, 'error');
    
    // Optionally highlight the problematic input fields
    if (errors.some(e => e.includes('Regression Length'))) {
        elements.regressionLengthInput?.classList.add('input-error');
        setTimeout(() => {
            elements.regressionLengthInput?.classList.remove('input-error');
        }, 3000);
    }
    
    if (errors.some(e => e.includes('Lookback Periods'))) {
        elements.lookbackPeriodsInput?.classList.add('input-error');
        setTimeout(() => {
            elements.lookbackPeriodsInput?.classList.remove('input-error');
        }, 3000);
    }
}

function setupPresetButtons() {
    // Add preset buttons dynamically if they don't exist
    const modalBody = elements.indicatorModal?.querySelector('.py-4');
    if (!modalBody) return;

    let presetContainer = modalBody.querySelector('.preset-buttons-container');
    if (!presetContainer) {
        presetContainer = document.createElement('div');
        presetContainer.className = 'preset-buttons-container form-control mb-4';
        presetContainer.innerHTML = `
            <label class="label">
                <span class="label-text font-medium flex items-center gap-2">
                    <i class="fas fa-magic text-primary"></i>
                    Quick Lookback Presets
                </span>
            </label>
            <div class="flex flex-wrap gap-2">
                <button type="button" class="btn btn-xs btn-outline" data-preset="scalping">
                    <i class="fas fa-bolt"></i> Scalping (0-5)
                </button>
                <button type="button" class="btn btn-xs btn-outline" data-preset="day-trading">
                    <i class="fas fa-chart-bar"></i> Day Trading (0-10)
                </button>
                <button type="button" class="btn btn-xs btn-outline" data-preset="swing">
                    <i class="fas fa-chart-area"></i> Swing (0-30)
                </button>
                <button type="button" class="btn btn-xs btn-outline" data-preset="longterm">
                    <i class="fas fa-chart-pie"></i> Long Term (0-50)
                </button>
            </div>
        `;
        
        // Insert at the beginning of the modal body
        modalBody.insertBefore(presetContainer, modalBody.firstChild);
    }

    // Add event listeners
    presetContainer.addEventListener('click', (event) => {
        const button = event.target.closest('[data-preset]');
        if (!button) return;

        const preset = button.dataset.preset;
        applyRegressionPreset(preset);

        // Update button states
        presetContainer.querySelectorAll('.btn').forEach(btn => {
            btn.classList.remove('btn-active');
        });
        button.classList.add('btn-active');
    });
}