// frontend_soa/src/ui/settings.js - Enhanced with debugging and forced visibility
import { store } from '../state/store.js';
import { chartController } from '../chart/chart.controller.js';
import { getDomElements } from './dom.js';

class SettingsManager {
    constructor() {
        this.elements = getDomElements();
        this.initialized = false;
        this.debugMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    }

    initialize() {
        if (this.initialized) return;
        
        console.log('🔧 Settings Manager Initializing...');
        
        try {
            // Force debug mode for troubleshooting
            this.enableDebugMode();
            
            // Get fresh references to elements
            this.refreshElements();
            
            // Ensure modal is visible
            this.ensureModalVisibility();
            
            // Setup functionality
            this.setupTabSwitching();
            this.setupColorInputs();
            this.syncSettingsInputs();
            
            this.initialized = true;
            console.log('✅ Settings Manager Initialized');
            
        } catch (error) {
            console.error('❌ Settings Manager initialization failed:', error);
            this.debugModalState();
        }
    }

    enableDebugMode() {
        if (this.debugMode) {
            document.body.classList.add('debug-settings');
            console.log('🐛 Debug mode enabled for settings');
        }
    }

    refreshElements() {
        const modal = document.getElementById('settings_modal');
        if (!modal) {
            console.error('❌ Settings modal not found in DOM');
            return;
        }

        this.modal = modal;
        this.modalBox = modal.querySelector('.modal-box');
        this.tabsContainer = modal.querySelector('.tabs');
        this.tabs = modal.querySelectorAll('.tab');
        this.tabContents = modal.querySelectorAll('.tab-content');
        
        console.log('🔄 Elements refreshed:', {
            modal: !!this.modal,
            modalBox: !!this.modalBox,
            tabsContainer: !!this.tabsContainer,
            tabs: this.tabs.length,
            tabContents: this.tabContents.length
        });
    }

    ensureModalVisibility() {
        if (!this.modal) return;
        
        console.log('🔧 Ensuring modal visibility...');
        
        // Force modal to be visible with strong CSS
        this.modal.style.cssText = `
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            z-index: 9999 !important;
            position: fixed !important;
            inset: 0 !important;
            background: rgba(0, 0, 0, 0.6) !important;
            align-items: center !important;
            justify-content: center !important;
        `;
        
        if (this.modalBox) {
            this.modalBox.style.cssText = `
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                background: #1f2937 !important;
                color: white !important;
                padding: 2rem !important;
                border-radius: 0.75rem !important;
                border: 3px solid #3b82f6 !important;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
                transform: none !important;
                max-width: 32rem !important;
                width: 90vw !important;
                max-height: 80vh !important;
                overflow-y: auto !important;
                position: relative !important;
                z-index: 10000 !important;
            `;
        }
        
        console.log('✅ Modal visibility forced');
    }

    setupTabSwitching() {
        if (!this.tabsContainer) {
            console.warn('⚠️ Tabs container not found');
            return;
        }

        console.log('🔄 Setting up tab switching...');

        this.tabsContainer.addEventListener('click', (event) => {
            const clickedTab = event.target.closest('.tab');
            if (!clickedTab) return;

            console.log('📑 Tab clicked:', clickedTab.textContent);

            // Remove active class from all tabs with force
            this.tabs.forEach(tab => {
                tab.classList.remove('tab-active');
                tab.style.backgroundColor = 'transparent';
                tab.style.color = '#d1d5db';
            });
            
            // Add active class to clicked tab with force
            clickedTab.classList.add('tab-active');
            clickedTab.style.cssText = `
                background-color: #3b82f6 !important;
                color: #ffffff !important;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3) !important;
                font-weight: 700 !important;
                border: 2px solid #60a5fa !important;
            `;

            // Hide all tab contents with force
            this.tabContents.forEach(content => {
                content.classList.add('hidden');
                content.style.display = 'none';
            });

            // Show target content with force
            const targetTabId = clickedTab.dataset.tab;
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.remove('hidden');
                targetContent.style.cssText = `
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                `;
                console.log('✅ Tab content shown:', targetTabId);
            } else {
                console.error('❌ Tab content not found:', targetTabId);
            }
        });

        // Ensure first tab is active by default
        if (this.tabs.length > 0) {
            this.tabs[0].click();
        }

        console.log('✅ Tab switching setup complete');
    }

    setupColorInputs() {
        console.log('🎨 Setting up color inputs...');
        
        // Get fresh references to inputs
        this.elements = getDomElements();

        // Grid color
        if (this.elements.gridColorInput) {
            this.elements.gridColorInput.addEventListener('input', (e) => {
                console.log('🎨 Grid color changed:', e.target.value);
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
            console.log('✅ Grid color input setup');
        }

        // Watermark text
        if (this.elements.watermarkInput) {
            this.elements.watermarkInput.addEventListener('input', (e) => {
                console.log('📝 Watermark changed:', e.target.value);
                const chart = chartController.getChart();
                if (chart) {
                    chart.applyOptions({
                        watermark: { text: e.target.value }
                    });
                }
            });
            console.log('✅ Watermark input setup');
        }

        // Series colors
        const applySeriesColors = () => {
            console.log('🎨 Applying series colors...');
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

        seriesColorInputs.forEach((input, index) => {
            if (input) {
                input.addEventListener('change', applySeriesColors);
                console.log(`✅ Series color input ${index} setup`);
            }
        });

        // Volume colors
        const applyVolumeColors = () => {
            console.log('🔊 Applying volume colors...');
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

        [this.elements.volUpColorInput, this.elements.volDownColorInput].forEach((input, index) => {
            if (input) {
                input.addEventListener('change', applyVolumeColors);
                console.log(`✅ Volume color input ${index} setup`);
            }
        });

        // Show OHLC Legend toggle
        if (this.elements.showOHLCLegendToggle) {
            this.elements.showOHLCLegendToggle.addEventListener('change', (e) => {
                console.log('👁️ OHLC legend toggle:', e.target.checked);
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
            console.log('✅ OHLC legend toggle setup');
        }

        console.log('✅ Color inputs setup complete');
    }

    syncSettingsInputs() {
        console.log('🔄 Syncing settings inputs...');
        
        const currentTheme = store.get('theme');
        const isDark = currentTheme === 'dark';
        
        // Set default grid color based on theme
        if (this.elements.gridColorInput) {
            this.elements.gridColorInput.value = isDark ? '#333333' : '#e0e0e0';
        }
        
        // Set default colors with force
        const defaultColors = {
            upColor: '#10b981',
            downColor: '#ef4444',
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
            volUpColor: '#10b981',
            volDownColor: '#ef4444'
        };

        Object.entries(defaultColors).forEach(([key, value]) => {
            const input = this.elements[key + 'Input'];
            if (input) {
                input.value = value;
                input.style.border = '2px solid #4b5563';
            }
        });
        
        // Set default watermark
        if (this.elements.watermarkInput) {
            this.elements.watermarkInput.value = 'My Trading Platform';
            this.elements.watermarkInput.style.border = '2px solid #4b5563';
        }

        console.log('✅ Settings inputs synced');
    }

    debugModalState() {
        console.group('🐛 Settings Modal Debug State');
        
        const modal = document.getElementById('settings_modal');
        if (!modal) {
            console.error('❌ Modal not found');
            console.groupEnd();
            return;
        }

        const styles = window.getComputedStyle(modal);
        console.log('📊 Modal computed styles:', {
            display: styles.display,
            visibility: styles.visibility,
            opacity: styles.opacity,
            zIndex: styles.zIndex,
            position: styles.position
        });

        const modalBox = modal.querySelector('.modal-box');
        if (modalBox) {
            const boxStyles = window.getComputedStyle(modalBox);
            console.log('📦 Modal box styles:', {
                display: boxStyles.display,
                visibility: boxStyles.visibility,
                opacity: boxStyles.opacity,
                backgroundColor: boxStyles.backgroundColor,
                width: boxStyles.width,
                height: boxStyles.height
            });
        }

        console.groupEnd();
    }

    updateThemeToggleIcon() {
        const theme = store.get('theme');
        if (this.elements.themeToggle) {
            this.elements.themeToggle.checked = theme === 'dark';
        }
    }

    // Public method to force modal visibility
    forceVisible() {
        this.ensureModalVisibility();
        this.debugModalState();
    }
}

export const settingsManager = new SettingsManager();