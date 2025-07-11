import { setupUiListeners } from '../chart/ui-listeners.js';
import { setupChartInteractionListeners, setupChartInfiniteScroll } from '../chart/chart-interaction-listeners.js';
import { setupDrawingToolbarListeners } from '../chart/drawing-toolbar-listeners.js';
import { setupIndicatorListeners } from '../regression/indicator-listeners.js'; // NEW

/**
 * Initializes all event listeners for the application.
 */
export function initializeAllEventListeners(stateObj, elementsObj) {
    const stateRef = stateObj || state;
    const elementsRef = elementsObj || getDomElements();

    setupUiListeners(stateRef, elementsRef);
    setupChartInteractionListeners(stateRef, elementsRef);
    setupChartInfiniteScroll(stateRef, elementsRef);
    setupDrawingToolbarListeners(stateRef, elementsRef);
    setupIndicatorListeners(stateRef, elementsRef); // NEW
}
