// frontend_soa/src/ui/components/drawingToolbar.js
import { chartController } from '../../chart/chart.controller.js';
import { getDomElements } from '../dom.js';

class DrawingToolbar {
    constructor() {
        this.elements = getDomElements();
        this.autoScaleActive = true;
    }

    initialize() {
        this.createDrawingToolbar();
        this.setupEventListeners();
        console.log('DrawingToolbar Component Initialized');
    }

    createDrawingToolbar() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        // Find the chart container
        const chartSection = mainContent.querySelector('.flex-1.p-1');
        if (!chartSection) return;

        // Create drawing toolbar HTML
        const toolbarHTML = `
            <div id="drawing-toolbar" class="flex items-center justify-center gap-2 p-2 bg-base-100 border-t border-base-300">
                <button id="tool-trend-line" class="btn btn-sm btn-ghost" title="Trend Line">
                    <i class="fas fa-chart-line"></i>
                </button>
                <button id="tool-horizontal-line" class="btn btn-sm btn-ghost" title="Horizontal Line">
                    <i class="fas fa-ruler-horizontal"></i>
                </button>
                <button id="tool-fib-retracement" class="btn btn-sm btn-ghost" title="Fibonacci Retracement">
                    <i class="fas fa-wave-square"></i>
                </button>
                <button id="tool-rectangle" class="btn btn-sm btn-ghost" title="Rectangle">
                    <i class="far fa-square"></i>
                </button>
                <button id="tool-brush" class="btn btn-sm btn-ghost" title="Brush">
                    <i class="fas fa-paint-brush"></i>
                </button>
                
                <div class="divider divider-horizontal h-6"></div>
                
                <button id="tool-remove-selected" class="btn btn-sm btn-ghost text-error" title="Remove Selected">
                    <i class="fas fa-eraser"></i>
                </button>
                <button id="tool-remove-all" class="btn btn-sm btn-ghost text-error" title="Remove All">
                    <i class="fas fa-trash-alt"></i>
                </button>
                
                <div class="divider divider-horizontal h-6"></div>
                
                <div id="scaling-buttons-container">
                    <div class="join">
                        <button id="scaling-auto-btn" class="btn btn-sm join-item btn-active" title="Automatic Scaling">
                            Auto
                        </button>
                        <button id="scaling-linear-btn" class="btn btn-sm join-item" title="Linear Scaling">
                            Linear
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Insert toolbar after chart section
        chartSection.insertAdjacentHTML('afterend', toolbarHTML);
    }

    setupEventListeners() {
        // Drawing tool buttons
        this.addToolListener('tool-trend-line', 'TrendLine');
        this.addToolListener('tool-horizontal-line', 'HorizontalLine');
        this.addToolListener('tool-fib-retracement', 'FibRetracement');
        this.addToolListener('tool-rectangle', 'Rectangle');
        this.addToolListener('tool-brush', 'Brush');

        // Remove buttons
        this.addRemoveListener('tool-remove-selected', 'removeSelectedLineTools');
        this.addRemoveListener('tool-remove-all', 'removeAllLineTools');

        // Scaling buttons
        this.addScalingListeners();
    }

    addToolListener(buttonId, toolName) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', () => {
                const chart = chartController.getChart();
                if (chart && chart.setActiveLineTool) {
                    chart.setActiveLineTool(toolName);
                }
            });
        }
    }

    addRemoveListener(buttonId, methodName) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', () => {
                const chart = chartController.getChart();
                if (chart && chart[methodName]) {
                    chart[methodName]();
                }
            });
        }
    }

    addScalingListeners() {
        const autoBtn = document.getElementById('scaling-auto-btn');
        const linearBtn = document.getElementById('scaling-linear-btn');

        if (autoBtn) {
            autoBtn.addEventListener('click', () => {
                this.applyAutoScaling();
                this.updateScalingButtonStates(true);
            });
        }

        if (linearBtn) {
            linearBtn.addEventListener('click', () => {
                this.applyLinearScaling();
                this.updateScalingButtonStates(false);
            });
        }
    }

    applyAutoScaling() {
        const chart = chartController.getChart();
        if (!chart) return;

        // Apply autoscale using chart controller method
        chartController.applyAutoscaling();
        this.autoScaleActive = true;
    }

    applyLinearScaling() {
        const chart = chartController.getChart();
        if (!chart) return;

        chart.priceScale().applyOptions({ autoScale: false });
        chart.timeScale().applyOptions({ rightOffset: 0 });
        this.autoScaleActive = false;
    }

    updateScalingButtonStates(autoActive) {
        const autoBtn = document.getElementById('scaling-auto-btn');
        const linearBtn = document.getElementById('scaling-linear-btn');

        if (autoBtn && linearBtn) {
            if (autoActive) {
                autoBtn.classList.add('btn-active');
                linearBtn.classList.remove('btn-active');
            } else {
                autoBtn.classList.remove('btn-active');
                linearBtn.classList.add('btn-active');
            }
        }
    }

    // Public method to trigger auto-scaling from external components
    triggerAutoScaling() {
        if (this.autoScaleActive) {
            this.applyAutoScaling();
        }
    }
}

export const drawingToolbar = new DrawingToolbar();