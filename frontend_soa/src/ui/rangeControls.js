// frontend_soa/src/ui/rangeControls.js - Fixed with working presets
import { store } from '../state/store.js';
import { showToast } from './helpers.js';

class RangeControls {
    constructor() {
        this.initialized = false;
        this.elements = {};
        this.isUpdating = false; // Prevent circular updates
    }

    initialize() {
        if (this.initialized) {
            console.log('🔄 Range controls already initialized, refreshing...');
            this.refreshElements();
            return;
        }
        
        console.log('🎛️ Initializing Range Controls...');
        
        this.getElements();
        
        if (!this.elementsAvailable()) {
            console.warn('⚠️ Range control elements not found, using fallback');
            return false;
        }
        
        this.setupEventListeners();
        this.setupPresetButtons();
        this.updateDisplays();
        this.generateAndDisplayPeriods();
        
        this.initialized = true;
        console.log('✅ Range Controls Initialized');
        return true;
    }

    refreshElements() {
        this.getElements();
        if (this.elementsAvailable()) {
            this.updateDisplays();
            this.generateAndDisplayPeriods();
        }
    }

    getElements() {
        console.log('🔍 Getting range control elements...');
        
        this.elements = {
            // Sliders
            minLookbackSlider: document.getElementById('min-lookback-slider'),
            maxLookbackSlider: document.getElementById('max-lookback-slider'),
            stepSizeSlider: document.getElementById('step-size-slider'),
            
            // Number inputs
            minLookbackInput: document.getElementById('min-lookback-input'),
            maxLookbackInput: document.getElementById('max-lookback-input'),
            stepSizeInput: document.getElementById('step-size-input'),
            
            // Display elements
            minLookbackDisplay: document.getElementById('min-lookback-display'),
            maxLookbackDisplay: document.getElementById('max-lookback-display'),
            stepSizeDisplay: document.getElementById('step-size-display'),
            lookbackPreview: document.getElementById('lookback-preview'),
            periodCount: document.getElementById('period-count'),
            
            // Preset container
            presetContainer: document.querySelector('.preset-buttons-container')
        };
        
        // Debug element availability
        const available = Object.entries(this.elements).filter(([key, el]) => !!el);
        const missing = Object.entries(this.elements).filter(([key, el]) => !el);
        
        console.log(`✅ Found ${available.length} elements:`, available.map(([key]) => key));
        if (missing.length > 0) {
            console.warn(`⚠️ Missing ${missing.length} elements:`, missing.map(([key]) => key));
        }
    }

    elementsAvailable() {
        const required = ['minLookbackSlider', 'maxLookbackSlider', 'stepSizeSlider'];
        return required.every(key => !!this.elements[key]);
    }

    setupEventListeners() {
        console.log('🔗 Setting up range control event listeners...');
        
        // Min lookback controls
        if (this.elements.minLookbackSlider && this.elements.minLookbackInput) {
            this.elements.minLookbackSlider.addEventListener('input', (e) => {
                if (this.isUpdating) return;
                const value = parseInt(e.target.value);
                this.handleMinLookbackChange(value);
            });

            this.elements.minLookbackInput.addEventListener('input', (e) => {
                if (this.isUpdating) return;
                const value = parseInt(e.target.value);
                this.handleMinLookbackChange(value);
            });
            
            console.log('✅ Min lookback listeners attached');
        }

        // Max lookback controls
        if (this.elements.maxLookbackSlider && this.elements.maxLookbackInput) {
            this.elements.maxLookbackSlider.addEventListener('input', (e) => {
                if (this.isUpdating) return;
                const value = parseInt(e.target.value);
                this.handleMaxLookbackChange(value);
            });

            this.elements.maxLookbackInput.addEventListener('input', (e) => {
                if (this.isUpdating) return;
                const value = parseInt(e.target.value);
                this.handleMaxLookbackChange(value);
            });
            
            console.log('✅ Max lookback listeners attached');
        }

        // Step size controls
        if (this.elements.stepSizeSlider && this.elements.stepSizeInput) {
            this.elements.stepSizeSlider.addEventListener('input', (e) => {
                if (this.isUpdating) return;
                const value = parseInt(e.target.value);
                this.handleStepSizeChange(value);
            });

            this.elements.stepSizeInput.addEventListener('input', (e) => {
                if (this.isUpdating) return;
                const value = parseInt(e.target.value);
                this.handleStepSizeChange(value);
            });
            
            console.log('✅ Step size listeners attached');
        }
    }

    setupPresetButtons() {
        if (!this.elements.presetContainer) {
            console.warn('⚠️ Preset container not found');
            return;
        }

        console.log('🎛️ Setting up preset buttons...');

        // Remove existing listeners to avoid duplicates
        const existingButtons = this.elements.presetContainer.querySelectorAll('[data-preset]');
        existingButtons.forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
        });

        // Add event listener to container (event delegation)
        this.elements.presetContainer.addEventListener('click', (event) => {
            const button = event.target.closest('[data-preset]');
            if (!button) return;

            const preset = button.dataset.preset;
            console.log(`🎯 Preset clicked: ${preset}`);
            
            this.applyPreset(preset);

            // Update button states
            this.elements.presetContainer.querySelectorAll('[data-preset]').forEach(btn => {
                btn.classList.remove('btn-active');
            });
            button.classList.add('btn-active');
            
            // Show feedback
            showToast(`Applied ${preset} preset`, 'success');
        });

        console.log('✅ Preset buttons setup complete');
    }

    handleMinLookbackChange(value) {
        this.isUpdating = true;
        
        console.log(`📊 Min lookback changed: ${value}`);
        
        const currentMax = this.getCurrentMaxLookback();
        
        // Auto-adjust max if needed
        if (value >= currentMax) {
            const newMax = value + 1;
            this.setMaxLookback(newMax);
            console.log(`📈 Auto-adjusted max lookback to: ${newMax}`);
        }
        
        // Update input field to match slider
        if (this.elements.minLookbackInput) {
            this.elements.minLookbackInput.value = value;
        }
        
        this.updateDisplays();
        this.generateAndDisplayPeriods();
        
        this.isUpdating = false;
    }

    handleMaxLookbackChange(value) {
        this.isUpdating = true;
        
        console.log(`📊 Max lookback changed: ${value}`);
        
        const currentMin = this.getCurrentMinLookback();
        
        // Auto-adjust min if needed
        if (value <= currentMin) {
            const newMin = Math.max(0, value - 1);
            this.setMinLookback(newMin);
            console.log(`📉 Auto-adjusted min lookback to: ${newMin}`);
        }
        
        // Update input field to match slider
        if (this.elements.maxLookbackInput) {
            this.elements.maxLookbackInput.value = value;
        }
        
        this.updateDisplays();
        this.generateAndDisplayPeriods();
        
        this.isUpdating = false;
    }

    handleStepSizeChange(value) {
        this.isUpdating = true;
        
        console.log(`📊 Step size changed: ${value}`);
        
        // Update input field to match slider
        if (this.elements.stepSizeInput) {
            this.elements.stepSizeInput.value = value;
        }
        
        this.updateDisplays();
        this.generateAndDisplayPeriods();
        
        this.isUpdating = false;
    }

    getCurrentMinLookback() {
        return parseInt(this.elements.minLookbackInput?.value || this.elements.minLookbackSlider?.value || 0);
    }

    getCurrentMaxLookback() {
        return parseInt(this.elements.maxLookbackInput?.value || this.elements.maxLookbackSlider?.value || 5);
    }

    getCurrentStepSize() {
        return parseInt(this.elements.stepSizeInput?.value || this.elements.stepSizeSlider?.value || 1);
    }

    setMinLookback(value) {
        if (this.elements.minLookbackSlider) this.elements.minLookbackSlider.value = value;
        if (this.elements.minLookbackInput) this.elements.minLookbackInput.value = value;
    }

    setMaxLookback(value) {
        if (this.elements.maxLookbackSlider) this.elements.maxLookbackSlider.value = value;
        if (this.elements.maxLookbackInput) this.elements.maxLookbackInput.value = value;
    }

    setStepSize(value) {
        if (this.elements.stepSizeSlider) this.elements.stepSizeSlider.value = value;
        if (this.elements.stepSizeInput) this.elements.stepSizeInput.value = value;
    }

    updateDisplays() {
        const minValue = this.getCurrentMinLookback();
        const maxValue = this.getCurrentMaxLookback();
        const stepValue = this.getCurrentStepSize();

        if (this.elements.minLookbackDisplay) {
            this.elements.minLookbackDisplay.textContent = minValue;
        }
        if (this.elements.maxLookbackDisplay) {
            this.elements.maxLookbackDisplay.textContent = maxValue;
        }
        if (this.elements.stepSizeDisplay) {
            this.elements.stepSizeDisplay.textContent = stepValue;
        }
        
        console.log(`📊 Displays updated - Min: ${minValue}, Max: ${maxValue}, Step: ${stepValue}`);
    }

    generateAndDisplayPeriods() {
        const minLookback = this.getCurrentMinLookback();
        const maxLookback = this.getCurrentMaxLookback();
        const stepSize = this.getCurrentStepSize();
        
        const periods = [];
        for (let i = minLookback; i <= maxLookback; i += stepSize) {
            periods.push(i);
        }
        
        console.log(`📈 Generated periods: [${periods.join(', ')}]`);
        
        // Update preview display
        if (this.elements.lookbackPreview) {
            this.elements.lookbackPreview.textContent = `[${periods.join(', ')}]`;
        }
        
        if (this.elements.periodCount) {
            this.elements.periodCount.textContent = `${periods.length} periods`;
        }
        
        // Validation with user feedback
        if (periods.length > 50) {
            showToast('Warning: Many periods may impact performance', 'warning');
        } else if (periods.length === 0) {
            showToast('Error: No periods generated', 'error');
        }
        
        return periods;
    }

    applyPreset(presetName) {
        console.log(`🎯 Applying preset: ${presetName}`);
        
        const presets = {
            scalping: { min: 0, max: 5, step: 1 },
            'day-trading': { min: 0, max: 10, step: 1 },
            swing: { min: 0, max: 30, step: 2 },
            longterm: { min: 0, max: 50, step: 5 }
        };

        const preset = presets[presetName];
        if (!preset) {
            console.error(`❌ Unknown preset: ${presetName}`);
            showToast(`Unknown preset: ${presetName}`, 'error');
            return;
        }

        this.isUpdating = true;

        // Update all controls
        this.setMinLookback(preset.min);
        this.setMaxLookback(preset.max);
        this.setStepSize(preset.step);

        this.updateDisplays();
        this.generateAndDisplayPeriods();
        
        this.isUpdating = false;
        
        console.log(`✅ Preset ${presetName} applied:`, preset);
    }

    getLookbackPeriods() {
        if (!this.elementsAvailable()) {
            console.warn('⚠️ Range controls not available, returning default periods');
            return [0, 1, 2, 3, 4, 5];
        }
        
        return this.generateAndDisplayPeriods();
    }

    getLookbackPeriodsAsString() {
        return this.getLookbackPeriods().join(',');
    }

    // Reset to default values
    reset() {
        console.log('🔄 Resetting range controls to defaults...');
        
        this.isUpdating = true;
        
        this.setMinLookback(0);
        this.setMaxLookback(5);
        this.setStepSize(1);
        
        this.updateDisplays();
        this.generateAndDisplayPeriods();
        
        this.isUpdating = false;
        
        // Clear active preset buttons
        if (this.elements.presetContainer) {
            this.elements.presetContainer.querySelectorAll('.btn').forEach(btn => {
                btn.classList.remove('btn-active');
            });
        }
        
        console.log('✅ Range controls reset');
    }

    // Debug method to check current state
    getState() {
        return {
            initialized: this.initialized,
            elementsAvailable: this.elementsAvailable(),
            currentValues: {
                min: this.getCurrentMinLookback(),
                max: this.getCurrentMaxLookback(),
                step: this.getCurrentStepSize()
            },
            generatedPeriods: this.getLookbackPeriods()
        };
    }
}

export const rangeControls = new RangeControls();