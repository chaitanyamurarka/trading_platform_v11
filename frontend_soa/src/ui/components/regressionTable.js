// frontend_soa/src/ui/components/regressionTable.js
import { store } from '../../state/store.js';
import { getDomElements } from '../dom.js';

class RegressionTable {
    constructor(store) {
        this.store = store;
        this.elements = getDomElements();
    }

    initialize() {
        this.store.subscribe('isIndicatorActive', (isActive) => {
            const container = document.getElementById('regression-table-container');
            if (container) {
                container.classList.toggle('hidden', !isActive);
            }
        });

        this.store.subscribe('regressionResults', (results) => {
            this.render(results);
        });

        console.log('RegressionTable Component Initialized');
    }

    render(data) {
        const tableHead = document.querySelector('#regression-table thead');
        const tableBody = document.querySelector('#regression-table tbody');
        
        if (!tableHead || !tableBody) return;
        
        if (!data || !data.regression_results) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center p-4 text-base-content/60">
                        No indicators applied. Use the 'Indicators' button to run an analysis.
                    </td>
                </tr>`;
            return;
        }

        const { request_params, regression_results } = data;
        if (!regression_results || regression_results.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center p-4 text-base-content/60">
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
        srNoTh.className = 'sticky left-0 z-20 bg-base-100 border-r border-base-300 text-center';
        headerRow.appendChild(srNoTh);

        // Timeframe column (sticky left)
        const timeframeTh = document.createElement('th');
        timeframeTh.textContent = 'Timeframe';
        timeframeTh.className = 'sticky left-16 z-20 bg-base-100 border-r border-base-300 text-center';
        headerRow.appendChild(timeframeTh);

        // Slope columns (in descending order)
        sortedLookbackPeriods.forEach(period => {
            const th = document.createElement('th');
            th.textContent = `S[${period}]`;
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
            
            // Sr. No. cell (sticky left)
            const srCell = row.insertCell();
            srCell.textContent = index + 1;
            srCell.className = 'sticky left-0 bg-base-100 border-r border-base-300 text-center';
            
            // Timeframe cell (sticky left)
            const timeframeCell = row.insertCell();
            timeframeCell.textContent = timeframeResult.timeframe;
            timeframeCell.className = 'sticky left-16 bg-base-100 border-r border-base-300 text-center';

            let totalRValue = 0;
            let rValueCount = 0;

            // Slope values for each lookback (in descending order)
            sortedLookbackPeriods.forEach(period => {
                const slopeTd = row.insertCell();
                const result = timeframeResult.results[period.toString()];
                if (result) {
                    slopeTd.textContent = result.slope.toFixed(5);
                    // Use proper color classes without background
                    slopeTd.className = result.slope > 0 
                        ? 'text-success text-center font-medium' 
                        : 'text-error text-center font-medium';
                    totalRValue += Math.abs(result.r_value);
                    rValueCount++;
                } else {
                    slopeTd.textContent = 'N/A';
                    slopeTd.className = 'text-center text-base-content/60';
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
    }
}

export const regressionTable = new RegressionTable(store);