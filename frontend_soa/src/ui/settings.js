// frontend_soa/src/ui/settings.js - Simplified to match frontend_services
import { store } from '../state/store.js';
import { chartController } from '../chart/chart.controller.js';
import { getDomElements } from './dom.js';

class SettingsManager {
    constructor() {
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) return;
        
        console.log('Settings Manager Initializing...');
        
        this.setupTabSwitching();
        this.setupColorInputs();
        this.syncSettingsInputs();
        
        this.initialized = true;
        console.log('Settings Manager Initialized');
    }

    setupTabSwitching() {
        const tabsContainer = document.querySelector('#settings_modal .tabs');
        if (!tabsContainer) return;

        tabsContainer.addEventListener('click', (event) => {
            const clickedTab = event.target.closest('.tab');
            if (!clickedTab) return;

            // Update active tab
            tabsContainer.querySelectorAll('.tab').forEach(tab => tab.classList.remove('tab-active'));
            clickedTab.classList.add('tab-active');

            // Show/hide tab contents
            const tabContents = document.querySelectorAll('#settings_modal .tab-content');
            tabContents.forEach(content => content.classList.add('hidden'));

            const targetTabId = clickedTab.dataset.tab;
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.remove('hidden');
            }
        });
    }

    setupColorInputs() {
        const elements = getDomElements();

        // Watermark text - no grid color input anymore
        if (elements.watermarkInput) {
            elements.watermarkInput.addEventListener('input', (e) => {
                const chart = chartController.getChart();
                if (chart) {
                    chart.applyOptions({
                        watermark: { text: e.target.value }
                    });
                }
            });
        }

        // Series colors
        const applySeriesColors = () => {
            const disableWicks = elements.disableWicksInput?.checked || false;
            
            store.set('seriesColors', {
                upColor: elements.upColorInput?.value || '#10b981',
                downColor: elements.downColorInput?.value || '#ef4444',
                wickUpColor: disableWicks ? 'rgba(0,0,0,0)' : (elements.wickUpColorInput?.value || '#10b981'),
                wickDownColor: disableWicks ? 'rgba(0,0,0,0)' : (elements.wickDownColorInput?.value || '#ef4444'),
                borderUpColor: elements.upColorInput?.value || '#10b981',
                borderDownColor: elements.downColorInput?.value || '#ef4444',
            });
        };

        [elements.upColorInput, elements.downColorInput, elements.wickUpColorInput, 
         elements.wickDownColorInput, elements.disableWicksInput].forEach(input => {
            if (input) {
                input.addEventListener('change', applySeriesColors);
            }
        });

        // Volume colors
        const applyVolumeColors = () => {
            const volumeData = store.get('volumeData');
            const chartData = store.get('chartData');
            
            if (!volumeData || !chartData || !chartController.getVolumeSeries()) return;

            const priceActionMap = new Map();
            chartData.forEach(priceData => {
                priceActionMap.set(priceData.time, priceData.close >= priceData.open);
            });

            const newVolumeData = volumeData.map(volumeBar => ({
                ...volumeBar,
                color: priceActionMap.get(volumeBar.time) 
                    ? (elements.volUpColorInput?.value || '#10b981') + '80' 
                    : (elements.volDownColorInput?.value || '#ef4444') + '80',
            }));

            store.set('volumeData', newVolumeData);
        };

        [elements.volUpColorInput, elements.volDownColorInput].forEach(input => {
            if (input) {
                input.addEventListener('change', applyVolumeColors);
            }
        });

        // Show OHLC Legend toggle
        if (elements.showOHLCLegendToggle) {
            elements.showOHLCLegendToggle.addEventListener('change', (e) => {
                store.set('showOHLCLegend', e.target.checked);
                const dataLegend = document.getElementById('data-legend');
                if (dataLegend && !e.target.checked) {
                    dataLegend.style.display = 'none';
                }
            });
        }
    }

    syncSettingsInputs() {
        const elements = getDomElements();
        
        // No need to sync grid color anymore
        
        const defaultColors = {
            upColor: '#10b981',
            downColor: '#ef4444',
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
            volUpColor: '#10b981',
            volDownColor: '#ef4444'
        };
        
        Object.entries(defaultColors).forEach(([key, value]) => {
            const input = elements[key + 'Input'];
            if (input) {
                input.value = value;
            }
        });
        
        if (elements.watermarkInput) {
            elements.watermarkInput.value = 'My Trading Platform';
        }
    }
}

export const settingsManager = new SettingsManager();