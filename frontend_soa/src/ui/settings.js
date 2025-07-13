// frontend_soa/src/ui/settings.js - New file for settings management
import { store } from '../state/store.js';
import { chartController } from '../chart/chart.controller.js';
import { getDomElements } from './dom.js';

class SettingsManager {
    constructor() {
        this.elements = getDomElements();
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) return;
        
        this.setupTabSwitching();
        this.setupColorInputs();
        this.syncSettingsInputs();
        this.initialized = true;
        
        console.log('Settings Manager Initialized');
    }

    setupTabSwitching() {
        const settingsModal = this.elements.settingsModal;
        if (!settingsModal) return;

        const tabsContainer = settingsModal.querySelector('.tabs');
        if (!tabsContainer) return;

        tabsContainer.addEventListener('click', (event) => {
            const clickedTab = event.target.closest('.tab');
            if (!clickedTab) return;

            // Remove active class from all tabs
            tabsContainer.querySelectorAll('.tab').forEach(tab => 
                tab.classList.remove('tab-active')
            );
            
            // Add active class to clicked tab
            clickedTab.classList.add('tab-active');

            // Hide all tab contents
            const tabContents = settingsModal.querySelectorAll('.tab-content');
            tabContents.forEach(content => content.classList.add('hidden'));

            // Show target content
            const targetTabId = clickedTab.dataset.tab;
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.remove('hidden');
            }
        });
    }

    setupColorInputs() {
        // Grid color
        if (this.elements.gridColorInput) {
            this.elements.gridColorInput.addEventListener('input', (e) => {
                const chart = chartController.getChart();
                if (chart) {
                    chart.applyOptions({
                        grid: {
                            vertLines: { color: e.target.value },
                            horzLines: { color: e.target.value }
                        }
                    });
                }
            });
        }

        // Watermark text
        if (this.elements.watermarkInput) {
            this.elements.watermarkInput.addEventListener('input', (e) => {
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
            const disableWicks = this.elements.disableWicksInput?.checked || false;
            
            store.set('seriesColors', {
                upColor: this.elements.upColorInput?.value || '#10b981',
                downColor: this.elements.downColorInput?.value || '#ef4444',
                wickUpColor: disableWicks ? 'rgba(0,0,0,0)' : (this.elements.wickUpColorInput?.value || '#10b981'),
                wickDownColor: disableWicks ? 'rgba(0,0,0,0)' : (this.elements.wickDownColorInput?.value || '#ef4444'),
                borderUpColor: this.elements.upColorInput?.value || '#10b981',
                borderDownColor: this.elements.downColorInput?.value || '#ef4444',
            });
            
            // Recreate series to apply new colors
            const chartType = store.get('selectedChartType');
            chartController.recreateMainSeries(chartType);
        };

        const seriesColorInputs = [
            this.elements.upColorInput,
            this.elements.downColorInput,
            this.elements.wickUpColorInput,
            this.elements.wickDownColorInput,
            this.elements.disableWicksInput
        ];

        seriesColorInputs.forEach(input => {
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
                    ? (this.elements.volUpColorInput?.value || '#10b981') + '80' 
                    : (this.elements.volDownColorInput?.value || '#ef4444') + '80',
            }));

            store.set('volumeData', newVolumeData);
        };

        [this.elements.volUpColorInput, this.elements.volDownColorInput].forEach(input => {
            if (input) {
                input.addEventListener('change', applyVolumeColors);
            }
        });

        // Show OHLC Legend toggle
        if (this.elements.showOHLCLegendToggle) {
            this.elements.showOHLCLegendToggle.addEventListener('change', (e) => {
                store.set('showOHLCLegend', e.target.checked);
                const dataLegend = document.getElementById('data-legend');
                if (dataLegend) {
                    if (!e.target.checked) {
                        dataLegend.style.display = 'none';
                    } else {
                        chartController.showLatestOHLCValues();
                    }
                }
            });
        }
    }

    syncSettingsInputs() {
        const currentTheme = store.get('theme');
        const isDark = currentTheme === 'dark';
        
        // Set default grid color based on theme
        if (this.elements.gridColorInput) {
            this.elements.gridColorInput.value = isDark ? '#333333' : '#e0e0e0';
        }
        
        // Set default colors
        if (this.elements.upColorInput) this.elements.upColorInput.value = '#10b981';
        if (this.elements.downColorInput) this.elements.downColorInput.value = '#ef4444';
        if (this.elements.wickUpColorInput) this.elements.wickUpColorInput.value = '#10b981';
        if (this.elements.wickDownColorInput) this.elements.wickDownColorInput.value = '#ef4444';
        if (this.elements.volUpColorInput) this.elements.volUpColorInput.value = '#10b981';
        if (this.elements.volDownColorInput) this.elements.volDownColorInput.value = '#ef4444';
        
        // Set default watermark
        if (this.elements.watermarkInput) {
            this.elements.watermarkInput.value = 'My Trading Platform';
        }
    }

    updateThemeToggleIcon() {
        const theme = store.get('theme');
        if (this.elements.themeToggle) {
            this.elements.themeToggle.checked = theme === 'dark';
        }
    }
}

export const settingsManager = new SettingsManager();