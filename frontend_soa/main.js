// frontend_soa/main.js
import { store } from './src/state/store.js';
import { sessionService } from './src/services/session.service.js';
import { dataService } from './src/services/data.service.js';
import { indicatorService } from './src/services/indicator.service.js';
import { chartController } from './src/chart/chart.controller.js';
import { initializeUiListeners } from './src/ui/listeners.js';
import { populateSymbolSelect } from './src/ui/helpers.js';
import { getDomElements, updateElementsCache } from './src/ui/dom.js';
import { regressionTable } from './src/ui/components/regressionTable.js';
import { drawingToolbar } from './src/ui/components/drawingToolbar.js';

// Define the main application class
class App {
    constructor() {
        this.store = store;
    }

    async init() {
        console.log('🚀 Application Initializing...');
        
        // --- Get DOM elements AFTER DOM is loaded ---
        const elements = getDomElements();

        // 1. Initialize UI listeners to capture user input
        initializeUiListeners(elements);

        // 2. Initialize the Chart Controller to render data
        chartController.initialize(elements);

        // 3. Initialize UI Components
        await this.initializeUIComponents();

        // 4. Initialize all services
        dataService.initialize();
        indicatorService.initialize();

        // 5. Start the session to get a token
        await sessionService.startSession();
        
        // 6. Fetch symbols and populate the dropdown
        const symbols = await sessionService.fetchSymbols();
        if (symbols && symbols.length > 0) {
            populateSymbolSelect(symbols, elements);
            this.store.set('selectedSymbol', symbols[0]?.symbol || 'SPY');
        }

        console.log('✅ Application Ready.');
    }

    async initializeUIComponents() {
        // Initialize drawing toolbar
        drawingToolbar.initialize();
        
        // Initialize regression table
        regressionTable.initialize();
        
        // Update elements cache after dynamic content creation
        updateElementsCache();
        
        // Add data legend to chart container if it doesn't exist
        this.ensureDataLegendExists();
    }

    ensureDataLegendExists() {
        const chartContainer = document.getElementById('chart-container');
        let dataLegend = document.getElementById('data-legend');
        
        if (chartContainer && !dataLegend) {
            dataLegend = document.createElement('div');
            dataLegend.id = 'data-legend';
            dataLegend.className = 'absolute top-2 left-2 z-10 p-2 bg-base-200 bg-opacity-70 rounded-md text-xs pointer-events-none hidden';
            chartContainer.appendChild(dataLegend);
            console.log('Data legend created');
        }
    }
}

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init().catch(error => {
        console.error('Failed to initialize application:', error);
    });
});