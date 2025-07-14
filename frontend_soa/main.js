// frontend_soa/main.js - Updated to remove debug files and match frontend_services
import { store } from './src/state/store.js';
import { sessionService } from './src/services/session.service.js';
import { dataService } from './src/services/data.service.js';
import { indicatorService } from './src/services/indicator.service.js';
import { chartController } from './src/chart/chart.controller.js';
import { initializeUiListeners } from './src/ui/listeners.js';
import { populateSymbolSelect
    , populateExchangeSelect } from './src/ui/helpers.js'; // Import our new function
import { getDomElements, updateElementsCache } from './src/ui/dom.js';
import { regressionTable } from './src/ui/components/regressionTable.js';
import { drawingToolbar } from './src/ui/components/drawingToolbar.js';
import { rangeControls } from './src/ui/rangeControls.js';

class App {
    constructor() {
        this.store = store;
    }

    async init() {
        console.log('🚀 Application Initializing...');
        
        try {
            // 1. Initialize UI Components FIRST
            await this.initializeUIComponents();

            // 2. Get DOM elements AFTER components are created
            const elements = getDomElements();

            // 3. Initialize UI listeners
            initializeUiListeners(elements);

            // 4. Initialize the Chart Controller
            chartController.initialize(elements);

            // 5. Initialize all services
            dataService.initialize();
            indicatorService.initialize();

            // 6. Start the session
            console.log('Starting session...');
            await sessionService.startSession();
            
            // 7. Fetch symbols and populate the dropdown
            console.log('Fetching symbols...');
            const symbols = await sessionService.fetchSymbols();
            if (symbols && symbols.length > 0) {
                populateExchangeSelect(symbols); // Populate the exchanges first
                populateSymbolSelect(symbols);    // Then populate the symbols

                // Set the initial selected symbol and exchange from the first symbol
                const firstSymbol = symbols[0];
                this.store.set('selectedSymbol', firstSymbol.symbol);
                
                const elements = getDomElements();
                elements.exchangeSelect.value = firstSymbol.exchange; // Set the dropdown value
                this.store.set('selectedExchange', firstSymbol.exchange); // And update the state

                console.log(`Symbols loaded: ${symbols.length} symbols`);
            } else {
                console.warn('No symbols loaded');
            }

            console.log('✅ Application Ready.');
            
        } catch (error) {
            console.error('❌ Application initialization failed:', error);
            
            const toastContainer = document.getElementById('toast-container');
            if (toastContainer) {
                const toast = document.createElement('div');
                toast.className = 'alert alert-error shadow-lg';
                toast.innerHTML = `<span>Failed to initialize application: ${error.message}</span>`;
                toastContainer.appendChild(toast);
            }
        }
    }

    async initializeUIComponents() {
        console.log('Initializing UI components...');
        
        // Initialize drawing toolbar
        drawingToolbar.initialize();
        
        // Initialize regression table
        regressionTable.initialize();
        
        // Replace indicator modal HTML with enhanced version
        this.replaceIndicatorModal();
        
        // Update elements cache after dynamic content creation
        updateElementsCache();
        
        // Add data legend to chart container if it doesn't exist
        this.ensureDataLegendExists();
        
        console.log('UI components initialized');
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

    replaceIndicatorModal() {
        const existingModal = document.getElementById('indicator_modal');
        if (!existingModal) return;

        // Enhanced modal HTML with range controls (same as before)
        const enhancedModalHTML = `
            <dialog id="indicator_modal" class="modal">
                <div class="modal-box w-11/12 max-w-2xl">
                    <h3 class="font-bold text-lg">Indicator Settings</h3>
                    <div class="py-4 space-y-4">
                        <div class="form-control">
                            <label class="label"><span class="label-text">Indicator</span></label>
                            <select id="indicator-select" class="select select-bordered select-sm">
                                <option value="linear_regression" selected>Linear Regression</option>
                            </select>
                        </div>
                        
                        <div id="linear-regression-settings">
                            <!-- Preset buttons container -->
                            <div class="preset-buttons-container form-control mb-4">
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
                            </div>
                            
                            <div class="form-control">
                                <label class="label"><span class="label-text">Regression Length</span></label>
                                <input type="number" id="indicator-regression-length" value="10" min="2" max="1000" class="input input-bordered input-sm">
                                <label class="label">
                                    <span class="label-text-alt">Number of candles to use for regression calculation (2-1000)</span>
                                </label>
                            </div>
                            
                            <!-- Enhanced Range Controls Card -->
                            <div class="card bg-base-200/50 shadow-sm">
                                <div class="card-body p-4">
                                    <h4 class="font-semibold text-base mb-3 flex items-center gap-2">
                                        <i class="fas fa-arrows-alt-h text-primary"></i>
                                        Lookback Period Range
                                        <div class="badge badge-info badge-xs">Enhanced</div>
                                    </h4>

                                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <!-- Min Lookback -->
                                        <div class="form-control">
                                            <label class="label">
                                                <span class="label-text text-sm">Min Lookback</span>
                                                <span class="label-text-alt" id="min-lookback-display">0</span>
                                            </label>
                                            <div class="flex items-center gap-2">
                                                <input 
                                                    type="range" 
                                                    id="min-lookback-slider" 
                                                    min="0" 
                                                    max="50" 
                                                    value="0" 
                                                    class="range range-secondary range-xs flex-1"
                                                >
                                                <input 
                                                    type="number" 
                                                    id="min-lookback-input" 
                                                    min="0" 
                                                    max="50" 
                                                    value="0" 
                                                    class="input input-bordered input-xs w-14 text-center"
                                                >
                                            </div>
                                        </div>

                                        <!-- Max Lookback -->
                                        <div class="form-control">
                                            <label class="label">
                                                <span class="label-text text-sm">Max Lookback</span>
                                                <span class="label-text-alt" id="max-lookback-display">5</span>
                                            </label>
                                            <div class="flex items-center gap-2">
                                                <input 
                                                    type="range" 
                                                    id="max-lookback-slider" 
                                                    min="1" 
                                                    max="50" 
                                                    value="5" 
                                                    class="range range-accent range-xs flex-1"
                                                >
                                                <input 
                                                    type="number" 
                                                    id="max-lookback-input" 
                                                    min="1" 
                                                    max="50" 
                                                    value="5" 
                                                    class="input input-bordered input-xs w-14 text-center"
                                                >
                                            </div>
                                        </div>

                                        <!-- Step Size -->
                                        <div class="form-control">
                                            <label class="label">
                                                <span class="label-text text-sm">Step Size</span>
                                                <span class="label-text-alt" id="step-size-display">1</span>
                                            </label>
                                            <div class="flex items-center gap-2">
                                                <input 
                                                    type="range" 
                                                    id="step-size-slider" 
                                                    min="1" 
                                                    max="5" 
                                                    value="1" 
                                                    class="range range-warning range-xs flex-1"
                                                >
                                                <input 
                                                    type="number" 
                                                    id="step-size-input" 
                                                    min="1" 
                                                    max="5" 
                                                    value="1" 
                                                    class="input input-bordered input-xs w-14 text-center"
                                                >
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Live Preview -->
                                    <div class="mt-4">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="text-sm font-medium">Generated Periods:</span>
                                            <div class="badge badge-primary badge-sm" id="period-count">6 periods</div>
                                        </div>
                                        <div class="bg-base-100 rounded p-2 text-xs font-mono border" id="lookback-preview">
                                            [0, 1, 2, 3, 4, 5]
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="form-control">
                                <label class="label"><span class="label-text">Timeframes</span></label>
                                <div id="indicator-timeframes" class="grid grid-cols-3 gap-2">
                                    <label class="flex items-center gap-2"><input type="checkbox" value="10s" class="checkbox checkbox-sm" checked> 10s</label>
                                    <label class="flex items-center gap-2"><input type="checkbox" value="30s" class="checkbox checkbox-sm" checked> 30s</label>
                                    <label class="flex items-center gap-2"><input type="checkbox" value="45s" class="checkbox checkbox-sm"> 45s</label>
                                    <label class="flex items-center gap-2"><input type="checkbox" value="1m" class="checkbox checkbox-sm" checked> 1m</label>
                                    <label class="flex items-center gap-2"><input type="checkbox" value="5m" class="checkbox checkbox-sm" checked> 5m</label>
                                    <label class="flex items-center gap-2"><input type="checkbox" value="15m" class="checkbox checkbox-sm"> 15m</label>
                                    <label class="flex items-center gap-2"><input type="checkbox" value="1h" class="checkbox checkbox-sm"> 1h</label>
                                </div>
                            </div>
                            
                            <!-- Live regression options -->
                            <div class="form-control">
                                <label class="cursor-pointer label">
                                    <span class="label-text">Enable Live Updates</span>
                                    <input type="checkbox" id="enable-live-regression" class="toggle toggle-sm toggle-success" checked>
                                </label>
                                <label class="label">
                                    <span class="label-text-alt">Automatically update regression values in real-time (requires Live Mode)</span>
                                </label>
                            </div>
                            
                            <div class="alert alert-info text-xs">
                                <i class="fas fa-info-circle"></i>
                                <span>Live regression updates require Live Mode to be enabled. Historical analysis is always available.</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-action">
                        <button id="indicator-apply-btn" class="btn btn-primary">Apply</button>
                        <form method="dialog"><button class="btn">Close</button></form>
                    </div>
                </div>
                <form method="dialog" class="modal-backdrop"><button>close</button></form>
            </dialog>
        `;

        // Replace the existing modal
        existingModal.outerHTML = enhancedModalHTML;
        
        console.log('Indicator modal enhanced with range controls');
    }
}

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init().catch(error => {
        console.error('Failed to initialize application:', error);
        
        document.body.innerHTML += `
            <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white p-6 rounded-lg shadow-lg max-w-md">
                    <h3 class="text-lg font-bold text-red-600 mb-2">Application Error</h3>
                    <p class="text-gray-700 mb-4">Failed to initialize the application. Please refresh the page and try again.</p>
                    <button onclick="window.location.reload()" class="btn btn-primary">Reload Page</button>
                </div>
            </div>
        `;
    });
});