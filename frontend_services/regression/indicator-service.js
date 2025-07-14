// frontend/src/services/indicator-service.js
import { state } from '../chart/state.js';
import { getDomElements } from '../main/dom-elements.js';
import { fetchRegressionData } from '../api/api.js';
import { populateRegressionTable, showToast } from '../chart/ui-helpers.js';
import { 
    connectToLiveRegression, 
    disconnectFromLiveRegression, 
    isLiveRegressionConnected 
} from './live-regression-websocket.js';

const elements = getDomElements();

/**
 * Gathers settings from the UI, calls the regression API,
 * and populates the results table. Now also connects to live regression if enabled.
 */
export async function runRegressionAnalysis() {
    // 1. Update state from UI, with validation
    const regressionLength = parseInt(elements.regressionLengthInput.value, 10);
    if (isNaN(regressionLength) || regressionLength < 2) {
        showToast('Regression Length must be at least 2.', 'error');
        return;
    }
    state.regressionSettings.length = regressionLength;

    // NEW: Get range settings and generate periods
    const minLookback = parseInt(elements.minLookbackInput?.value || 0, 10);
    const maxLookback = parseInt(elements.maxLookbackInput?.value || 5, 10);
    const stepSize = parseInt(elements.stepSizeInput?.value || 1, 10);

    // Validation for range settings
    if (minLookback >= maxLookback) {
        showToast('Minimum lookback must be less than maximum lookback.', 'error');
        return;
    }

    if (stepSize < 1) {
        showToast('Step size must be at least 1.', 'error');
        return;
    }

    // Update state with range settings
    state.regressionSettings.minLookback = minLookback;
    state.regressionSettings.maxLookback = maxLookback;
    state.regressionSettings.stepSize = stepSize;

    // Generate lookback periods from range
    const generatedPeriods = [];
    for (let i = minLookback; i <= maxLookback; i += stepSize) {
        generatedPeriods.push(i);
    }
    state.regressionSettings.lookbackPeriods = generatedPeriods;

    // Fallback: If range controls don't exist, use old comma-separated input
    if (!elements.minLookbackInput && elements.lookbackPeriodsInput) {
        try {
            state.regressionSettings.lookbackPeriods = elements.lookbackPeriodsInput.value
                .split(',')
                .map(p => {
                    const num = parseInt(p.trim(), 10);
                    if (isNaN(num)) throw new Error();
                    return num;
                });
        } catch (e) {
            showToast('Invalid format for Lookback Periods. Please use comma-separated numbers.', 'error');
            return;
        }
    }
    
    // Get selected timeframes from checkboxes
    state.regressionSettings.timeframes = 
        Array.from(elements.timeframesContainer.querySelectorAll('input[type="checkbox"]:checked'))
             .map(cb => cb.value);

    if (state.regressionSettings.timeframes.length === 0) {
        showToast('Please select at least one timeframe.', 'error');
        return;
    }

    // 2. Build request body for historical regression
    const currentSymbol = elements.symbolSelect.value;
    const requestBody = {
        symbol: currentSymbol,
        exchange: elements.exchangeSelect.value,
        regression_length: state.regressionSettings.length,
        lookback_periods: state.regressionSettings.lookbackPeriods,
        timeframes: state.regressionSettings.timeframes,
    };

    showToast('Running regression analysis...', 'info');
    elements.indicatorApplyBtn.classList.add('loading');
    elements.indicatorApplyBtn.disabled = true;

    try {
        // 3. Call historical regression API
        const results = await fetchRegressionData(requestBody);
        state.regressionResults = results;
        state.isIndicatorActive = true;
        state.activeIndicatorSymbol = currentSymbol;

        // 4. Populate table with historical data
        populateRegressionTable(results);
        
        // 5. NEW: Connect to live regression if live mode is enabled
        if (elements.liveToggle && elements.liveToggle.checked) {
            await connectToLiveRegressionIfEnabled();
        }
        
        showToast('Regression analysis complete.', 'success');

    } catch (error) {
        console.error('Failed to run regression analysis:', error);
        showToast(error.message, 'error');
        if (elements.regressionTableBody) {
            const colspan = (state.regressionSettings.lookbackPeriods?.length || 0) + 3;
            elements.regressionTableBody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-error">Error: ${error.message}</td></tr>`;
        }
    } finally {
        elements.indicatorApplyBtn.classList.remove('loading');
        elements.indicatorApplyBtn.disabled = false;
        if (elements.indicatorModal.open) {
            elements.indicatorModal.close();
        }
    }
}

/**
 * NEW: Connects to live regression WebSocket if conditions are met
 */
async function connectToLiveRegressionIfEnabled() {
    // Only connect if we have active regression settings and live mode is on
    if (!state.isIndicatorActive || !elements.liveToggle.checked) {
        return;
    }

    // Disconnect any existing live regression connection
    if (isLiveRegressionConnected()) {
        await disconnectFromLiveRegression();
    }

    const liveSettings = {
        symbol: elements.symbolSelect.value,
        exchange: elements.exchangeSelect.value,
        timeframes: state.regressionSettings.timeframes,
        timezone: elements.timezoneSelect.value,
        regressionLength: state.regressionSettings.length,
        lookbackPeriods: state.regressionSettings.lookbackPeriods
    };

    try {
        await connectToLiveRegression(liveSettings);
        showToast('Live regression connected!', 'success');
    } catch (error) {
        console.error('Failed to connect to live regression:', error);
        showToast('Failed to connect to live regression', 'error');
    }
}

/**
 * NEW: Disconnects from live regression if connected
 */
export async function disconnectFromLiveRegressionIfConnected() {
    if (isLiveRegressionConnected()) {
        await disconnectFromLiveRegression();
        showToast('Live regression disconnected.', 'info');
    }
}

/**
 * Removes the regression analysis from the chart and disconnects live regression.
 */
export async function removeRegressionAnalysis() {
    // Disconnect live regression first
    await disconnectFromLiveRegressionIfConnected();
    
    // Reset state
    state.resetIndicatorState();
    
    // Hide table
    populateRegressionTable(null);
    
    showToast('Indicator removed.', 'info');
    if (elements.indicatorModal.open) {
        elements.indicatorModal.close();
    }
}

/**
 * NEW: Handles live mode toggle changes
 */
export async function handleLiveModeToggle(isLive) {
    if (isLive && state.isIndicatorActive) {
        // Live mode turned on and we have active regression - connect to live regression
        await connectToLiveRegressionIfEnabled();
    } else if (!isLive && isLiveRegressionConnected()) {
        // Live mode turned off - disconnect from live regression
        await disconnectFromLiveRegressionIfConnected();
    }
}

/**
 * NEW: Handles symbol changes when live regression is active
 */
export async function handleSymbolChangeForLiveRegression(newSymbol) {
    if (state.isIndicatorActive && state.activeIndicatorSymbol !== newSymbol) {
        if (isLiveRegressionConnected()) {
            // Disconnect from old symbol's live regression
            await disconnectFromLiveRegression();
        }
        
        // Update the active symbol
        state.activeIndicatorSymbol = newSymbol;
        
        // Automatically re-run the analysis for the new symbol
        await runRegressionAnalysis();
    }
}

/**
 * NEW: Gets the current status of regression analysis
 */
export function getRegressionStatus() {
    return {
        isActive: state.isIndicatorActive,
        activeSymbol: state.activeIndicatorSymbol,
        settings: state.regressionSettings,
        isLiveConnected: isLiveRegressionConnected()
    };
}

/**
 * NEW: Toggle live regression connection manually
 */
export async function toggleLiveRegression() {
    if (isLiveRegressionConnected()) {
        await disconnectFromLiveRegressionIfConnected();
    } else if (state.isIndicatorActive && elements.liveToggle.checked) {
        await connectToLiveRegressionIfEnabled();
    } else {
        showToast('Please run regression analysis and enable live mode first.', 'warning');
    }
}