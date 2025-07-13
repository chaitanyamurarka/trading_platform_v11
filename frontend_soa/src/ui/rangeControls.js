// frontend_soa/src/ui/rangeControls.js - New file for range controls
import { store } from '../state/store.js';
import { showToast } from './helpers.js';

class RangeControls {
    constructor() {
        this.initialized = false;
        this.elements = {};
    }

    initialize() {
        if (this.initialized) return;
        
        this.getElements();
        this.setupEventListeners();
        this.setupPresetButtons();
        this.updateDisplays();
        this.generateAndDisplayPeriods();
        
        this.initialized = true;
        console.log('Range Controls Initialized');
    }

    getElements() {
        this.elements = {
            minLookbackSlider: document.getElementById('min-lookback-slider'),
            minLookbackInput: document.getElementById('min-lookback-input'),
            maxLookbackSlider: document.getElementById('max-lookback-slider'),
            maxLookbackInput: document.getElementById('max-lookback-input'),
            stepSizeSlider: document.getElementById('step-size-slider'),
            stepSizeInput: document.getElementById('step-size-input'),
            minLookbackDisplay: document.getElementById('min-lookback-display'),
            maxLookbackDisplay: document.getElementById('max-lookback-display'),
            stepSizeDisplay: document.getElementById('step-size-display'),
            lookbackPreview: document.getElementById('lookback-preview'),
            periodCount: document.getElementById('period-count'),
            presetContainer: document.querySelector('.preset-buttons-container')
        };
    }

    setupEventListeners() {
        // Min lookback controls
        if (this.elements.minLookbackSlider && this.elements.minLookbackInput) {
            this.elements.minLookbackSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.minLookbackInput.value = value;
                this.handleMinLookbackChange(value);
            });

            this.elements.minLookbackInput.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.minLookbackSlider.value = value;
                this.handleMinLookbackChange(value);
            });
        }

        // Max lookback controls
        if (this.elements.maxLookbackSlider && this.elements.maxLookbackInput) {
            this.elements.maxLookbackSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.maxLookbackInput.value = value;
                this.handleMaxLookbackChange(value);
            });

            this.elements.maxLookbackInput.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.maxLookbackSlider.value = value;
                this.handleMaxLookbackChange(value);
            });
        }

        // Step size controls
        if (this.elements.stepSizeSlider && this.elements.stepSizeInput) {
            this.elements.stepSizeSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.stepSizeInput.value = value;
                this.handleStepSizeChange(value);
            });

            this.elements.stepSizeInput.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.elements.stepSizeSlider.value = value;
                this.handleStepSizeChange(value);
            });
        }
    }

    setupPresetButtons() {
        if (!this.elements.presetContainer) return;

        this.elements.presetContainer.addEventListener('click', (event) => {
            const button = event.target.closest('[data-preset]');
            if (!button) return;

            const preset = button.dataset.preset;
            this.applyPreset(preset);

            // Update button states
            this.elements.presetContainer.querySelectorAll('.btn').forEach(btn => {
                btn.classList.remove('btn-active');
            });
            button.classList.add('btn-active');
        });
    }

    handleMinLookbackChange(value) {
        const currentMax = this.getCurrentMaxLookback();
        
        // Auto-adjust max if needed
        if (value >= currentMax) {
            const newMax = value + 1;
            this.setMaxLookback(newMax);
        }
        
        this.updateDisplays();
        this.generateAndDisplayPeriods();
    }

    handleMaxLookbackChange(value) {
        const currentMin = this.getCurrentMinLookback();
        
        // Auto-adjust min if needed
        if (value <= currentMin) {
            const newMin = Math.max(0, value - 1);
            this.setMinLookback(newMin);
        }
        
        this.updateDisplays();
        this.generateAndDisplayPeriods();
    }

    handleStepSizeChange(value) {
        this.updateDisplays();
        this.generateAndDisplayPeriods();
    }

    getCurrentMinLookback() {
        return parseInt(this.elements.minLookbackInput?.value || 0);
    }

    getCurrentMaxLookback() {
        return parseInt(this.elements.maxLookbackInput?.value || 5);
    }

    getCurrentStepSize() {
        return parseInt(this.elements.stepSizeInput?.value || 1);
    }

    setMinLookback(value) {
        if (this.elements.minLookbackSlider) this.elements.minLookbackSlider.value = value;
        if (this.elements.minLookbackInput) this.elements.minLookbackInput.value = value;
    }

    setMaxLookback(value) {
        if (this.elements.maxLookbackSlider) this.elements.maxLookbackSlider.value = value;
        if (this.elements.maxLookbackInput) this.elements.maxLookbackInput.value = value;
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
    }

    generateAndDisplayPeriods() {
        const minLookback = this.getCurrentMinLookback();
        const maxLookback = this.getCurrentMaxLookback();
        const stepSize = this.getCurrentStepSize();
        
        const periods = [];
        for (let i = minLookback; i <= maxLookback; i += stepSize) {
            periods.push(i);
        }
        
        // Update preview display
        if (this.elements.lookbackPreview) {
            this.elements.lookbackPreview.textContent = `[${periods.join(', ')}]`;
        }
        
        if (this.elements.periodCount) {
            this.elements.periodCount.textContent = `${periods.length} periods`;
        }
        
        // Validation
        if (periods.length > 50) {
            showToast('Warning: Many periods may impact performance', 'warning');
        }
        
        return periods;
    }

    applyPreset(presetName) {
        const presets = {
            scalping: { min: 0, max: 5, step: 1 },
            'day-trading': { min: 0, max: 10, step: 1 },
            swing: { min: 0, max: 30, step: 2 },
            longterm: { min: 0, max: 50, step: 5 }
        };

        const preset = presets[presetName];
        if (!preset) return;

        // Update controls
        this.setMinLookback(preset.min);
        this.setMaxLookback(preset.max);
        
        if (this.elements.stepSizeSlider) this.elements.stepSizeSlider.value = preset.step;
        if (this.elements.stepSizeInput) this.elements.stepSizeInput.value = preset.step;

        this.updateDisplays();
        this.generateAndDisplayPeriods();
        
        showToast(`Applied ${presetName} preset`, 'success');
    }

    getLookbackPeriods() {
        return this.generateAndDisplayPeriods();
    }

    getLookbackPeriodsAsString() {
        return this.getLookbackPeriods().join(',');
    }

    // Reset to default values
    reset() {
        this.setMinLookback(0);
        this.setMaxLookback(5);
        
        if (this.elements.stepSizeSlider) this.elements.stepSizeSlider.value = 1;
        if (this.elements.stepSizeInput) this.elements.stepSizeInput.value = 1;
        
        this.updateDisplays();
        this.generateAndDisplayPeriods();
        
        // Clear active preset buttons
        if (this.elements.presetContainer) {
            this.elements.presetContainer.querySelectorAll('.btn').forEach(btn => {
                btn.classList.remove('btn-active');
            });
        }
    }
}

export const rangeControls = new RangeControls();