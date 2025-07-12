// frontend_soa/main.js
import { store } from './src/state/store.js';
import { sessionService } from './src/services/session.service.js';
import { dataService } from './src/services/data.service.js';
import { indicatorService } from './src/services/indicator.service.js';
import { chartController } from './src/chart/chart.controller.js';
import { initializeUiListeners } from './src/ui/listeners.js';
import { populateSymbolSelect } from './src/ui/helpers.js';
import { getDomElements } from './src/ui/dom.js';

// Define the main application class
class App {
    constructor() {
        this.store = store;
    }

    async init() {
        console.log('🚀 Application Initializing...');
        
        // --- FIX: Get DOM elements AFTER DOM is loaded ---
        const elements = getDomElements();

        // 1. Initialize UI listeners to capture user input
        initializeUiListeners(elements);

        // 2. Initialize the Chart Controller to render data
        chartController.initialize(elements);

        // 3. Initialize all services
        dataService.initialize();
        indicatorService.initialize();

        // 4. Start the session to get a token
        await sessionService.startSession();
        
        // 5. Fetch symbols and populate the dropdown
        const symbols = await sessionService.fetchSymbols();
        if (symbols && symbols.length > 0) {
            populateSymbolSelect(symbols, elements);
            this.store.set('selectedSymbol', symbols[0]?.symbol || 'SPY');
        }

        console.log('✅ Application Ready.');
    }
}

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
