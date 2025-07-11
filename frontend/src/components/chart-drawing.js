// frontend/static/js/app/5-chart-drawing.js
import { state } from '../utils/state.js';
import { getDomElements } from '../utils/dom-elements.js';

const elements = getDomElements();
import { getSeriesOptions } from '../utils/chart-options.js';

// Accept state and elements as arguments for better decoupling
export function recreateMainSeries(type, stateObj, elementsObj) {
    const stateRef = stateObj || state;
    const elementsRef = elementsObj || elements;
    if (stateRef.mainSeries) {
        stateRef.mainChart.removeSeries(stateRef.mainSeries);
    }
    const seriesOptions = getSeriesOptions();
    switch (type) {
        case 'bar':
            stateRef.mainSeries = stateRef.mainChart.addBarSeries(seriesOptions);
            break;
        case 'line':
            stateRef.mainSeries = stateRef.mainChart.addLineSeries({ color: seriesOptions.upColor });
            break;
        case 'area':
            stateRef.mainSeries = stateRef.mainChart.addAreaSeries({ lineColor: seriesOptions.upColor, topColor: `${seriesOptions.upColor}66`, bottomColor: `${seriesOptions.upColor}00` });
            break;
        default:
            stateRef.mainSeries = stateRef.mainChart.addCandlestickSeries(seriesOptions);
            break;
    }
    // Use the state helper to get the correct data array for the currently active chart type.
    const currentData = stateRef.getCurrentChartData ? stateRef.getCurrentChartData() : state.getCurrentChartData();
    if (currentData.length > 0) {
        stateRef.mainSeries.setData(currentData);
    }
}


export function applySeriesColors(stateObj, elementsObj) {
    const stateRef = stateObj || state;
    const elementsRef = elementsObj || elements;
    if (!stateRef.mainSeries) return;
    
    // Always recreate the series to ensure wick changes take effect
    recreateMainSeries(elementsRef.chartTypeSelect.value, stateRef, elementsRef);
}

export function applyVolumeColors(stateObj, elementsObj) {
    const stateRef = stateObj || state;
    if (!stateRef.volumeSeries || !stateRef.allChartData.length || !stateRef.allVolumeData.length) return;
    const priceActionMap = new Map();
    stateRef.allChartData.forEach(priceData => {
        priceActionMap.set(priceData.time, priceData.close >= priceData.open);
    });
    const newVolumeData = stateRef.allVolumeData.map(volumeData => ({
        ...volumeData,
        color: priceActionMap.get(volumeData.time) ? elements.volUpColorInput.value + '80' : elements.volDownColorInput.value + '80',
    }));
    stateRef.allVolumeData = newVolumeData;
    stateRef.volumeSeries.setData(stateRef.allVolumeData);
}

// --- MODIFIED: Corrected takeScreenshot function ---
export function takeScreenshot() {
    if (!state.mainChart) return;
    // The takeScreenshot() method returns a canvas element directly, not a promise.
    const canvas = state.mainChart.takeScreenshot();
    const link = document.createElement('a');
    link.href = canvas.toDataURL();
    link.download = `chart-screenshot-${new Date().toISOString()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}