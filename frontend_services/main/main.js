// frontend/static/js/main.js
// Pass state and elements explicitly to all major initializers for full decoupling
import { state }  from '../chart/state.js';
import { getDomElements } from '../main/dom-elements.js';  
const elements = getDomElements();
import { getChartTheme } from '../chart/chart-options.js';  
import { syncSettingsInputs, updateThemeToggleIcon, setAutomaticDateTime } from '../chart/ui-helpers.js';
import { recreateMainSeries, applySeriesColors, applyVolumeColors } from '../chart/chart-drawing.js';
import { startSession } from '../api/session-manager.js';
import { initializeAllEventListeners } from '../chart/event-listeners.js';
import { responsiveHandler } from '../chart/responsive-handler.js';

function initializeNewChartObject() {
    if (state.mainChart) state.mainChart.remove();
    state.mainChart = LightweightCharts.createChart(elements.chartContainer, getChartTheme(localStorage.getItem('chartTheme') || 'light'));
    state.mainSeries = null;
    state.volumeSeries = null;
    setTimeout(() => responsiveHandler.forceResize(), 100);
    syncSettingsInputs(state, elements);
    recreateMainSeries(elements.chartTypeSelect.value, state, elements);
    state.volumeSeries = state.mainChart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
    state.mainChart.priceScale('').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
}

document.addEventListener('DOMContentLoaded', () => {
    // Basic UI setup
    const savedTheme = localStorage.getItem('chartTheme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggleIcon(elements);
    setAutomaticDateTime(elements);

    // Initialize the chart object
    initializeNewChartObject();

    // Setup all event listeners from the new modules
    initializeAllEventListeners(state, elements);

    // Start the session, which will trigger the initial data load
    startSession(state, elements);

    // The call to fetchAndPopulateSymbols() is removed from here.
});