// frontend_soa/src/ui/components/regressionTable.js - Enhanced with pagination status
import { store } from '../../state/store.js';
import { getDomElements } from '../dom.js';
import { regressionVisualizer } from './regressionVisualizer.js';
import { indicatorService } from '../../services/indicator.service.js';

class RegressionTable {
    constructor(store) {
        this.store = store;
        this.elements = getDomElements();
        this.visualizationEnabled = false;
        this.isInitialRender = true;
    }

    initialize() {
        // Initialize the visualizer
        regressionVisualizer.initialize();

        this.store.subscribe('isIndicatorActive', (isActive) => {
            const container = document.getElementById('regression-table-container');
            if (container) {
                container.classList.toggle('hidden', !isActive);
                
                // Disable visualization when indicator is removed
                if (!isActive && this.visualizationEnabled) {
                    regressionVisualizer.disableVisualization();
                    this.visualizationEnabled = false;
                }
            }
        });

        this.store.subscribe('regressionResults', (results) => {
            this.render(results);
        });

        // Show live status
        this.store.subscribe('isLiveRegressionConnected', (isConnected) => {
            const liveStatusBadge = document.getElementById('live-regression-status');
            if (liveStatusBadge) {
                liveStatusBadge.classList.toggle('hidden', !isConnected);
            }
        });

        this.setupVisualizationControls();
        this.setupPaginationControls();
        
        console.log('RegressionTable Component Initialized');
    }

    setupVisualizationControls() {
        // Add visualization toggle button to the header
        const headerContainer = document.querySelector('#regression-table-container .flex.items-center');
        if (headerContainer) {
            const visualizeBtn = document.createElement('button');
            visualizeBtn.id = 'visualize-regression-btn';
            visualizeBtn.className = 'btn btn-xs btn-outline btn-primary';
            visualizeBtn.innerHTML = '<i class="fas fa-chart-line"></i> Visualize';
            visualizeBtn.title = 'Toggle regression line visualization on chart';
            
            visualizeBtn.addEventListener('click', () => {
                this.toggleVisualization();
            });

            // Insert before the remove button
            const removeBtn = document.getElementById('remove-regression-btn');
            if (removeBtn) {
                headerContainer.insertBefore(visualizeBtn, removeBtn);
            }
        }
    }

    setupPaginationControls() {
        // Add pagination status container after regression table
        const tableContainer = document.getElementById('regression-table-container');
        if (!tableContainer) return;

        // Create pagination status container
        const paginationHTML = `
            <div id="regression-pagination-status" class="mt-3 hidden">
                <div class="flex items-center justify-between bg-base-200 rounded-lg p-3">
                    <div class="flex items-center gap-3">
                        <span class="loading loading-spinner loading-xs" id="pagination-spinner"></span>
                        <span class="text-sm" id="pagination-status-text">Loading regression data...</span>
                    </div>
                    <button id="load-more-regression-btn" class="btn btn-xs btn-outline hidden">
                        Load More Results
                    </button>
                </div>
            </div>
        `;

        // Insert after the table scroll container
        const scrollContainer = document.getElementById('regression-table-scroll-container');
        if (scrollContainer && scrollContainer.parentElement) {
            scrollContainer.parentElement.insertAdjacentHTML('afterend', paginationHTML);
        }

        // Setup load more button
        const loadMoreBtn = document.getElementById('load-more-regression-btn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', async () => {
                loadMoreBtn.disabled = true;
                loadMoreBtn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Loading...';
                
                await indicatorService.loadMorePages();
                
                loadMoreBtn.disabled = false;
                loadMoreBtn.innerHTML = 'Load More Results';
                
                // Update pagination status
                this.updatePaginationStatus();
            });
        }
    }

    updatePaginationStatus() {
        const paginationStatus = indicatorService.getPaginationStatus();
        const analysisState = indicatorService.getAnalysisState();
        const statusContainer = document.getElementById('regression-pagination-status');
        const statusText = document.getElementById('pagination-status-text');
        const spinner = document.getElementById('pagination-spinner');
        const loadMoreBtn = document.getElementById('load-more-regression-btn');

        if (!statusContainer) return;

        // Show/hide pagination status based on indicator state
        if (analysisState.isActive && (paginationStatus.hasCursor || paginationStatus.isPaginating)) {
            statusContainer.classList.remove('hidden');
        } else {
            statusContainer.classList.add('hidden');
            return;
        }

        // Update UI based on pagination state
        if (paginationStatus.isPaginating) {
            spinner.classList.remove('hidden');
            statusText.textContent = 'Loading more regression results...';
            loadMoreBtn.classList.add('hidden');
        } else if (paginationStatus.canLoadMore) {
            spinner.classList.add('hidden');
            statusText.textContent = 'Additional results available';
            loadMoreBtn.classList.remove('hidden');
        } else {
            spinner.classList.add('hidden');
            statusText.textContent = 'All results loaded';
            loadMoreBtn.classList.add('hidden');
        }
    }

    toggleVisualization() {
        const currentInterval = this.store.get('selectedInterval');
        const results = this.store.get('regressionResults');
        
        if (!results || !results.regression_results) {
            alert('No regression results available for visualization');
            return;
        }

        // Check if current interval has regression data
        const hasCurrentInterval = results.regression_results.some(
            result => result.timeframe === currentInterval
        );

        if (!hasCurrentInterval) {
            alert(`No regression data available for timeframe: ${currentInterval}`);
            return;
        }

        const visualizeBtn = document.getElementById('visualize-regression-btn');
        
        if (this.visualizationEnabled) {
            // Disable visualization
            regressionVisualizer.disableVisualization();
            this.visualizationEnabled = false;
            
            if (visualizeBtn) {
                visualizeBtn.innerHTML = '<i class="fas fa-chart-line"></i> Visualize';
                visualizeBtn.classList.remove('btn-active');
            }
        } else {
            // Enable visualization
            regressionVisualizer.enableVisualization(currentInterval);
            this.visualizationEnabled = true;
            
            if (visualizeBtn) {
                visualizeBtn.innerHTML = '<i class="fas fa-eye"></i> Hide Lines';
                visualizeBtn.classList.add('btn-active');
            }
        }
    }

    render(data) {
        const tableHead = document.querySelector('#regression-table thead');
        const tableBody = document.querySelector('#regression-table tbody');
        
        if (!tableHead || !tableBody) return;
        
        // Update pagination status
        this.updatePaginationStatus();
        
        if (!data || !data.regression_results) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="11" class="text-center p-4 text-base-content/60">
                        No indicators applied. Use the 'Indicators' button to run an analysis.
                    </td>
                </tr>`;
            return;
        }

        const { request_params, regression_results } = data;
        if (!regression_results || regression_results.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="11" class="text-center p-4 text-base-content/60">
                        No regression results returned for the selected parameters.
                    </td>
                </tr>`;
            return;
        }

        // Sort lookback periods in descending order
        const sortedLookbackPeriods = [...request_params.lookback_periods].sort((a, b) => b - a);

        // Build Table Header
        tableHead.innerHTML = '';
        const headerRow = document.createElement('tr');
        
        // Sr. No. column (sticky left)
        const srNoTh = document.createElement('th');
        srNoTh.textContent = 'Sr. No.';
        srNoTh.className = 'sticky left-0 z-20 bg-base-100 border-r border-base-300 text-center w-16';
        headerRow.appendChild(srNoTh);

        // Timeframe column (sticky left)
        const timeframeTh = document.createElement('th');
        timeframeTh.textContent = 'Timeframe';
        timeframeTh.className = 'sticky left-16 z-20 bg-base-100 border-r border-base-300 text-center w-24';
        headerRow.appendChild(timeframeTh);

        // Regression Length column (sticky left)
        const regressionLengthTh = document.createElement('th');
        regressionLengthTh.textContent = 'Reg. Length';
        regressionLengthTh.className = 'sticky left-40 z-20 bg-base-100 border-r border-base-300 text-center w-24';
        headerRow.appendChild(regressionLengthTh);

        // Data Count column
        const dataCountTh = document.createElement('th');
        dataCountTh.textContent = 'Data Points';
        dataCountTh.className = 'text-center w-24';
        headerRow.appendChild(dataCountTh);

        // Slope columns (in descending order) with color indicators
        sortedLookbackPeriods.forEach(period => {
            const th = document.createElement('th');
            th.innerHTML = `
                <div class="flex items-center justify-center gap-1">
                    <div class="w-3 h-3 rounded-full border" 
                         style="background-color: ${this.getColorForLookback(period)}"
                         title="Line color for lookback ${period}"></div>
                    <span>S[${period}]</span>
                </div>
            `;
            th.className = 'text-center';
            headerRow.appendChild(th);
        });

        // R-Value column (sticky right)
        const rValueTh = document.createElement('th');
        rValueTh.textContent = 'R-Value (Avg)';
        rValueTh.className = 'sticky right-0 z-20 bg-base-100 border-l border-base-300 text-center';
        headerRow.appendChild(rValueTh);

        tableHead.appendChild(headerRow);

        // Build Table Body
        tableBody.innerHTML = '';
        regression_results.forEach((timeframeResult, index) => {
            const row = document.createElement('tr');
            
            // Add highlight for current timeframe
            const currentInterval = this.store.get('selectedInterval');
            if (timeframeResult.timeframe === currentInterval) {
                row.classList.add('bg-primary/10');
            }
            
            // Sr. No. cell (sticky left)
            const srCell = row.insertCell();
            srCell.textContent = index + 1;
            srCell.className = 'sticky left-0 z-10 bg-base-100 border-r border-base-300 text-center w-16';
            
            // Timeframe cell (sticky left)
            const timeframeCell = row.insertCell();
            timeframeCell.innerHTML = `
                <div class="flex items-center justify-center gap-1">
                    <span class="font-medium">${timeframeResult.timeframe}</span>
                    ${timeframeResult.is_partial ? '<div class="badge badge-warning badge-xs">partial</div>' : ''}
                </div>
            `;
            timeframeCell.className = 'sticky left-16 z-10 bg-base-100 border-r border-base-300 text-center w-24';

            // Regression Length cell (sticky left)
            const regressionLengthCell = row.insertCell();
            regressionLengthCell.textContent = request_params.regression_length;
            regressionLengthCell.className = 'sticky left-40 z-10 bg-base-100 border-r border-base-300 text-center w-24';

            // Data Count cell
            const dataCountCell = row.insertCell();
            dataCountCell.textContent = timeframeResult.data_count || 'N/A';
            dataCountCell.className = 'text-center w-24';

            let totalRValue = 0;
            let rValueCount = 0;

            // Slope values for each lookback (in descending order)
            sortedLookbackPeriods.forEach(period => {
                const slopeTd = row.insertCell();
                const result = timeframeResult.results[period.toString()];
                if (result) {
                    // Enhanced slope cell with color indicator and tooltip
                    const slopeValue = result.slope.toFixed(5);
                    const rSquared = (result.r_value * result.r_value).toFixed(3);
                    const timestamp = result.timestamp ? new Date(result.timestamp).toLocaleTimeString() : '';
                    
                    slopeTd.innerHTML = `
                        <div class="flex items-center justify-center gap-1" 
                             title="Slope: ${slopeValue}, R²: ${rSquared}, Calculated: ${timestamp}">
                            <div class="w-2 h-2 rounded-full" 
                                 style="background-color: ${this.getColorForLookback(period)}"></div>
                            <span>${slopeValue}</span>
                        </div>
                    `;
                    
                    // Use proper color classes without background
                    slopeTd.className = result.slope > 0 
                        ? 'text-success text-center font-medium' 
                        : 'text-error text-center font-medium';
                    totalRValue += Math.abs(result.r_value);
                    rValueCount++;
                } else {
                    slopeTd.textContent = '—';
                    slopeTd.className = 'text-center text-base-content/40';
                }
            });

            // R-Value cell (sticky right)
            const rValueTd = row.insertCell();
            if (rValueCount > 0) {
                const avgRValue = totalRValue / rValueCount;
                rValueTd.textContent = avgRValue.toFixed(4);
                rValueTd.className = 'text-center font-medium';
            } else {
                rValueTd.textContent = 'N/A';
                rValueTd.className = 'text-center text-base-content/60';
            }
            rValueTd.classList.add('sticky', 'right-0', 'bg-base-100', 'border-l', 'border-base-300');
            
            tableBody.appendChild(row);
        });

        // Add legend section below table
        this.renderLegend(sortedLookbackPeriods);

        // Add timestamp info
        this.renderTimestampInfo(data);

        // Scroll the table to the rightmost position only on the initial render
        if (this.isInitialRender) {
            const scrollContainer = document.getElementById('regression-table-scroll-container');
            if (scrollContainer) {
                scrollContainer.scrollLeft = scrollContainer.scrollWidth;
            }
            this.isInitialRender = false;
        }
    }

    renderLegend(lookbackPeriods) {
        const tableContainer = document.getElementById('regression-table-container');
        if (!tableContainer) return;

        // Remove existing legend
        const existingLegend = tableContainer.querySelector('.regression-legend');
        if (existingLegend) {
            existingLegend.remove();
        }

        // Create new legend
        const legend = document.createElement('div');
        legend.className = 'regression-legend mt-3 p-3 bg-base-200 rounded-lg';
        legend.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <h4 class="font-semibold text-sm">Regression Line Legend</h4>
                <div class="text-xs text-base-content/60">
                    ${this.visualizationEnabled ? 
                        `<i class="fas fa-eye text-success"></i> Lines visible on chart` : 
                        `<i class="fas fa-eye-slash text-base-content/40"></i> Lines hidden`
                    }
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                ${lookbackPeriods.map(period => `
                    <div class="flex items-center gap-2 text-xs">
                        <div class="w-4 h-2 rounded-sm" 
                             style="background-color: ${this.getColorForLookback(period)}"></div>
                        <span>L${period}</span>
                    </div>
                `).join('')}
            </div>
        `;

        tableContainer.appendChild(legend);
    }

    renderTimestampInfo(data) {
        const tableContainer = document.getElementById('regression-table-container');
        if (!tableContainer || !data.timestamp) return;

        // Remove existing timestamp info
        const existingInfo = tableContainer.querySelector('.regression-timestamp-info');
        if (existingInfo) {
            existingInfo.remove();
        }

        // Create timestamp info
        const timestampInfo = document.createElement('div');
        timestampInfo.className = 'regression-timestamp-info mt-2 text-xs text-base-content/60';
        timestampInfo.innerHTML = `
            <div class="flex items-center gap-4">
                <span><i class="fas fa-clock"></i> Analysis completed: ${new Date(data.timestamp).toLocaleString()}</span>
                ${data.is_partial ? '<span class="text-warning"><i class="fas fa-exclamation-triangle"></i> Partial results - more data available</span>' : ''}
            </div>
        `;

        tableContainer.appendChild(timestampInfo);
    }

    getColorForLookback(lookbackPeriod) {
        // Use the same color logic as the visualizer
        const commonColors = {
            0: '#FF6B6B',   // Red for immediate (0 lookback)
            1: '#4ECDC4',   // Teal for 1 period
            2: '#45B7D1',   // Blue for 2 periods
            3: '#96CEB4',   // Green for 3 periods
            5: '#FFEAA7',   // Yellow for 5 periods
            10: '#DDA0DD',  // Plum for 10 periods
            20: '#98D8C8',  // Mint for 20 periods
            30: '#F7DC6F',  // Light Yellow for 30 periods
        };

        if (commonColors[lookbackPeriod]) {
            return commonColors[lookbackPeriod];
        }

        // For other lookback periods, use cycling colors
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD',
            '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA'
        ];
        const colorIndex = lookbackPeriod % colors.length;
        return colors[colorIndex];
    }
}

export const regressionTable = new RegressionTable(store);