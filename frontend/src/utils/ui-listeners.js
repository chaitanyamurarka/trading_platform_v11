// frontend/src/utils/ui-listeners.js
import { getDomElements } from './dom-elements.js';

const elements = getDomElements();
import { state } from './state.js';
import { applyTheme, syncSettingsInputs, showToast, setAutomaticDateTime } from './ui-helpers.js';
import { takeScreenshot, recreateMainSeries, applySeriesColors, applyVolumeColors } from '../components/chart-drawing.js';
import { loadChartData } from '../services/api-service.js';
import { connectToLiveDataFeed, connectToLiveHeikinAshiData, disconnectFromAllLiveFeeds } from '../services/websocket-service.js';
import { 
    handleLiveModeToggle, 
    disconnectFromLiveRegressionIfConnected 
} from '../services/indicator-service.js';

export function setupUiListeners() {
    // --- MODIFICATION START ---
    // Controls that trigger a full data reload.
    // Interval, Candle Type, and Timezone now have dedicated listeners.
    [elements.exchangeSelect, elements.symbolSelect, elements.startTimeInput, elements.endTimeInput].forEach(control => {
        control.addEventListener('change', () => loadChartData(true));
    });

    /**
     * Handles changes to the timezone select dropdown.
     * Prevents changing the timezone if Live Mode is active and reverts to the previous state.
     */
    elements.timezoneSelect.addEventListener('change', (event) => {
        if (elements.liveToggle.checked) {
            showToast('Timezone cannot be changed while Live Mode is active.', 'warning');
            // Revert the dropdown's visible selection to the previous, valid timezone from the state
            event.target.value = state.timezone; 
            return;
        }
        // If not in live mode, it's a valid change.
        // Update the state with the new timezone, then reload the chart.
        state.timezone = event.target.value;
        loadChartData(true);
    });

    /**
     * Handles changes to the interval select dropdown.
     * Validates that the new interval is compatible with the selected candle type.
     */
    elements.intervalSelect.addEventListener('change', () => {
        const newInterval = elements.intervalSelect.value;
        const currentCandleType = elements.candleTypeSelect.value;

        // Validation: Prevent selecting a tick interval while on Heikin Ashi.
        if (newInterval.endsWith('tick') && currentCandleType === 'heikin_ashi') {
            showToast('Heikin Ashi is not compatible with Tick intervals.', 'error');
            elements.intervalSelect.value = state.interval; // Revert to last valid interval.
            return;
        }
        
        // Update state and reload chart
        state.interval = newInterval;
        if (state.interval.endsWith('tick')) {
            state.candleType = 'tick';
        } else {
            // If we switched from a tick interval, sync state.candleType with the UI.
            state.candleType = currentCandleType;
        }
        loadChartData(true);
    });

    /**
     * Handles changes to the candle type select dropdown.
     * Validates that the new candle type is compatible with the selected interval.
     */
    elements.candleTypeSelect.addEventListener('change', () => {
        const newCandleType = elements.candleTypeSelect.value;
        const currentInterval = elements.intervalSelect.value;

        // Validation: Prevent selecting Heikin Ashi while on a tick interval.
        if (newCandleType === 'heikin_ashi' && currentInterval.endsWith('tick')) {
            showToast('Heikin Ashi is not compatible with Tick intervals.', 'error');
            // Revert to last valid candle type. If it was 'tick', show 'regular' in the UI.
            elements.candleTypeSelect.value = state.candleType === 'tick' ? 'regular' : state.candleType;
            return;
        }

        // Update state and reload chart
        state.candleType = newCandleType;
        loadChartData(true);
    });
    // --- MODIFICATION END ---
    
    // UPDATED: Live Toggle with regression integration
    elements.liveToggle.addEventListener('change', async (event) => {
        const isLive = event.target.checked;
        
        if (isLive) {
            setAutomaticDateTime();
            await loadChartData(true);
            
            // NEW: Handle live regression connection
            await handleLiveModeToggle(true);
        } else {
            // Disconnect from all live feeds
            disconnectFromAllLiveFeeds();
            
            // NEW: Disconnect from live regression
            await disconnectFromLiveRegressionIfConnected();
            
            showToast('Live mode disabled', 'info');
        }
    });

    // Chart Type (Candlestick, Bar, etc.)
    elements.chartTypeSelect.addEventListener('change', () => {
        recreateMainSeries(elements.chartTypeSelect.value);
    });

    // Theme Toggle
    const themeToggleCheckbox = elements.themeToggle.querySelector('input[type="checkbox"]');
    themeToggleCheckbox.addEventListener('change', () => {
        applyTheme(themeToggleCheckbox.checked ? 'dark' : 'light');
    });

    // Screenshot Button
    elements.screenshotBtn.addEventListener('click', takeScreenshot);

    // Settings Modal Listeners
    setupSettingsModalListeners();
    
    // Sidebar Toggle Listener
    setupSidebarToggleListener();

    // Settings Tabs Listeners
    setupSettingsTabsListeners();

    // NEW: Setup regression-specific UI listeners
    setupRegressionUIListeners();
}

// NEW: Setup regression-specific UI listeners
function setupRegressionUIListeners() {
    // Listen for window focus/blur to manage live regression connections
    window.addEventListener('focus', () => {
        // Resume live regression updates when window regains focus
        if (state.isIndicatorActive && elements.liveToggle.checked) {
            console.log('Window focused - live regression should resume');
        }
    });

    window.addEventListener('blur', () => {
        // Optionally reduce update frequency when window loses focus
        console.log('Window blurred - live regression continues in background');
    });

    // Handle page unload to cleanly disconnect from live regression
    window.addEventListener('beforeunload', async () => {
        await disconnectFromLiveRegressionIfConnected();
    });

    // Add validation to regression inputs in real-time
    if (elements.regressionLengthInput) {
        elements.regressionLengthInput.addEventListener('input', (event) => {
            const value = parseInt(event.target.value, 10);
            if (isNaN(value) || value < 2) {
                event.target.classList.add('input-error');
            } else {
                event.target.classList.remove('input-error');
            }
        });
    }

    if (elements.lookbackPeriodsInput) {
        elements.lookbackPeriodsInput.addEventListener('input', (event) => {
            try {
                const periods = event.target.value.split(',').map(p => parseInt(p.trim(), 10));
                if (periods.some(p => isNaN(p) || p < 0)) {
                    event.target.classList.add('input-error');
                } else {
                    event.target.classList.remove('input-error');
                }
            } catch (e) {
                event.target.classList.add('input-error');
            }
        });
    }

    // Add quick preset buttons for common regression settings
    addRegressionPresetButtons();
}

// NEW: Add preset buttons for common regression configurations
function addRegressionPresetButtons() {
    const modal = elements.indicatorModal;
    if (!modal) return;

    // Find the linear regression settings container
    const linearRegressionSettings = document.getElementById('linear-regression-settings');
    if (!linearRegressionSettings) return;

    // Create preset buttons container if it doesn't exist
    let presetContainer = linearRegressionSettings.querySelector('.preset-buttons');
    if (!presetContainer) {
        presetContainer = document.createElement('div');
        presetContainer.className = 'preset-buttons form-control';
        presetContainer.innerHTML = `
            <label class="label"><span class="label-text">Quick Timeframe Presets</span></label>
            <div class="flex flex-wrap gap-2">
                <button type="button" class="btn btn-xs btn-outline" data-preset="scalping">Scalping</button>
                <button type="button" class="btn btn-xs btn-outline" data-preset="day-trading">Day Trading</button>
                <button type="button" class="btn btn-xs btn-outline" data-preset="swing">Swing Trading</button>
                <button type="button" class="btn btn-xs btn-outline" data-preset="custom">Custom</button>
            </div>
        `;
        linearRegressionSettings.appendChild(presetContainer);
    }

    // Add event listeners to preset buttons
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

// NEW: Apply regression preset configurations
function applyRegressionPreset(preset) {
    const presets = {
        scalping: {
            length: 10,
            lookbackPeriods: '0,1,2,3,5',
            timeframes: ['10s', '30s', '1m']
        },
        'day-trading': {
            length: 20,
            lookbackPeriods: '0,1,3,5,10',
            timeframes: ['1m', '5m', '15m']
        },
        swing: {
            length: 50,
            lookbackPeriods: '0,5,10,20,30',
            timeframes: ['1h', '1d']
        },
        custom: {
            length: 14,
            lookbackPeriods: '0,1,2,3,4,5',
            timeframes: ['10s', '30s', '1m', '5m']
        }
    };

    const config = presets[preset];
    if (!config) return;

    // Apply settings to UI
    if (elements.regressionLengthInput) {
        elements.regressionLengthInput.value = config.length;
    }

    if (elements.lookbackPeriodsInput) {
        elements.lookbackPeriodsInput.value = config.lookbackPeriods;
    }

    // Update timeframe checkboxes
    if (elements.timeframesContainer) {
        const checkboxes = elements.timeframesContainer.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = config.timeframes.includes(checkbox.value);
        });
    }

    showToast(`Applied ${preset} preset configuration`, 'success');
}

// Unchanged functions below...
function setupSettingsModalListeners() {
    elements.gridColorInput.addEventListener('input', () => state.mainChart.applyOptions({ grid: { vertLines: { color: elements.gridColorInput.value }, horzLines: { color: elements.gridColorInput.value } } }));
    elements.watermarkInput.addEventListener('input', () => state.mainChart.applyOptions({ watermark: { text: elements.watermarkInput.value } }));
    
    [elements.upColorInput, elements.downColorInput, elements.wickUpColorInput, elements.wickDownColorInput, elements.disableWicksInput].forEach(input => {
        input.addEventListener('change', applySeriesColors);
    });

    [elements.volUpColorInput, elements.volDownColorInput].forEach(input => {
        input.addEventListener('change', applyVolumeColors);
    });

    elements.showOHLCLegendToggle.addEventListener('change', () => {
        state.showOHLCLegend = elements.showOHLCLegendToggle.checked;
        if (!state.showOHLCLegend) {
            elements.dataLegendElement.style.display = 'none';
        }
    });
}

function setupSidebarToggleListener() {
    if (elements.menuToggle && elements.sidebar && elements.sidebarOverlay) {
        const toggleSidebar = (event) => {
            console.log('Sidebar toggle initiated by:', event.currentTarget);
            
            elements.sidebar.classList.toggle('open');
            elements.sidebarOverlay.classList.toggle('hidden');
        };

        elements.menuToggle.addEventListener('click', toggleSidebar);
        elements.sidebarOverlay.addEventListener('click', toggleSidebar);
    } else {
        console.error('Could not find all required elements for sidebar toggle functionality.');
    }
}

function setupSettingsTabsListeners() {
    const tabsContainer = elements.settingsModal.querySelector('.tabs');
    if (!tabsContainer) return;

    tabsContainer.addEventListener('click', (event) => {
        const clickedTab = event.target.closest('.tab');
        if (!clickedTab) return;

        tabsContainer.querySelectorAll('.tab').forEach(tab => tab.classList.remove('tab-active'));
        clickedTab.classList.add('tab-active');

        const tabContents = elements.settingsModal.querySelectorAll('.tab-content');
        tabContents.forEach(content => content.classList.add('hidden'));

        const targetTabId = clickedTab.dataset.tab;
        const targetContent = document.getElementById(targetTabId);
        if (targetContent) {
            targetContent.classList.remove('hidden');
        }
    });
}