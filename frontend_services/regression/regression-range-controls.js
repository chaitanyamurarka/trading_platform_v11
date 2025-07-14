import { getDomElements } from '../main/dom-elements.js';
import { state } from '../chart/state.js';
import { showToast } from '../chart/ui-helpers.js';

const elements = getDomElements();

/**
 * Initialize the min/max range controls for regression settings
 */
export function initializeRegressionRangeControls() {
    if (!elements.minLookbackSlider) {
        console.log('Range controls not found, using fallback input');
        return false;
    }

    setupRangeEventListeners();
    updateRangeDisplays();
    return true;
}

/**
 * Setup event listeners for range controls
 */
function setupRangeEventListeners() {
    // Min lookback controls
    if (elements.minLookbackSlider && elements.minLookbackInput) {
        elements.minLookbackSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            elements.minLookbackInput.value = value;
            state.regressionSettings.minLookback = value;
            
            // Auto-adjust max if needed
            if (value >= state.regressionSettings.maxLookback) {
                state.regressionSettings.maxLookback = value + 1;
                elements.maxLookbackSlider.value = state.regressionSettings.maxLookback;
                elements.maxLookbackInput.value = state.regressionSettings.maxLookback;
            }
            
            updateRangeDisplays();
            generateAndDisplayPeriods();
        });

        elements.minLookbackInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            elements.minLookbackSlider.value = value;
            state.regressionSettings.minLookback = value;
            
            if (value >= state.regressionSettings.maxLookback) {
                state.regressionSettings.maxLookback = value + 1;
                elements.maxLookbackSlider.value = state.regressionSettings.maxLookback;
                elements.maxLookbackInput.value = state.regressionSettings.maxLookback;
            }
            
            updateRangeDisplays();
            generateAndDisplayPeriods();
        });
    }

    // Max lookback controls
    if (elements.maxLookbackSlider && elements.maxLookbackInput) {
        elements.maxLookbackSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            elements.maxLookbackInput.value = value;
            state.regressionSettings.maxLookback = value;
            
            // Auto-adjust min if needed
            if (value <= state.regressionSettings.minLookback) {
                state.regressionSettings.minLookback = Math.max(0, value - 1);
                elements.minLookbackSlider.value = state.regressionSettings.minLookback;
                elements.minLookbackInput.value = state.regressionSettings.minLookback;
            }
            
            updateRangeDisplays();
            generateAndDisplayPeriods();
        });

        elements.maxLookbackInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            elements.maxLookbackSlider.value = value;
            state.regressionSettings.maxLookback = value;
            
            if (value <= state.regressionSettings.minLookback) {
                state.regressionSettings.minLookback = Math.max(0, value - 1);
                elements.minLookbackSlider.value = state.regressionSettings.minLookback;
                elements.minLookbackInput.value = state.regressionSettings.minLookback;
            }
            
            updateRangeDisplays();
            generateAndDisplayPeriods();
        });
    }

    // Step size controls
    if (elements.stepSizeSlider && elements.stepSizeInput) {
        elements.stepSizeSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            elements.stepSizeInput.value = value;
            state.regressionSettings.stepSize = value;
            updateRangeDisplays();
            generateAndDisplayPeriods();
        });

        elements.stepSizeInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            elements.stepSizeSlider.value = value;
            state.regressionSettings.stepSize = value;
            updateRangeDisplays();
            generateAndDisplayPeriods();
        });
    }
}

/**
 * Update the display labels for range controls
 */
function updateRangeDisplays() {
    const minDisplay = document.getElementById('min-lookback-display');
    const maxDisplay = document.getElementById('max-lookback-display');
    const stepDisplay = document.getElementById('step-size-display');

    if (minDisplay) {
        minDisplay.textContent = state.regressionSettings.minLookback;
    }
    if (maxDisplay) {
        maxDisplay.textContent = state.regressionSettings.maxLookback;
    }
    if (stepDisplay) {
        stepDisplay.textContent = state.regressionSettings.stepSize;
    }
}

/**
 * Generate lookback periods from range and update preview
 */
function generateAndDisplayPeriods() {
    const periods = [];
    const { minLookback, maxLookback, stepSize } = state.regressionSettings;
    
    for (let i = minLookback; i <= maxLookback; i += stepSize) {
        periods.push(i);
    }
    
    // Update state
    state.regressionSettings.lookbackPeriods = periods;
    
    // Update preview display
    if (elements.lookbackPreview) {
        elements.lookbackPreview.textContent = `[${periods.join(', ')}]`;
    }
    
    if (elements.periodCount) {
        elements.periodCount.textContent = `${periods.length} periods`;
    }
    
    // Validation
    if (periods.length > 50) {
        showToast('Warning: Many periods may impact performance', 'warning');
    }
    
    return periods;
}

/**
 * Apply preset configurations
 */
export function applyRegressionPreset(presetName) {
    const presets = {
        scalping: { min: 0, max: 5, step: 1 },
        'day-trading': { min: 0, max: 10, step: 1 },
        swing: { min: 0, max: 30, step: 2 },
        longterm: { min: 0, max: 50, step: 5 }
    };

    const preset = presets[presetName];
    if (!preset) return;

    // Update state
    state.regressionSettings.minLookback = preset.min;
    state.regressionSettings.maxLookback = preset.max;
    state.regressionSettings.stepSize = preset.step;

    // Update UI controls
    if (elements.minLookbackSlider) elements.minLookbackSlider.value = preset.min;
    if (elements.minLookbackInput) elements.minLookbackInput.value = preset.min;
    if (elements.maxLookbackSlider) elements.maxLookbackSlider.value = preset.max;
    if (elements.maxLookbackInput) elements.maxLookbackInput.value = preset.max;
    if (elements.stepSizeSlider) elements.stepSizeSlider.value = preset.step;
    if (elements.stepSizeInput) elements.stepSizeInput.value = preset.step;

    updateRangeDisplays();
    generateAndDisplayPeriods();
    
    showToast(`Applied ${presetName} preset`, 'success');
}

/**
 * Get the current lookback periods as comma-separated string (for backward compatibility)
 */
export function getLookbackPeriodsAsString() {
    return state.regressionSettings.lookbackPeriods.join(',');
}