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
            this.elements.regressionTableContainer.classList.toggle('hidden', !isActive);
        });

        this.store.subscribe('regressionResults', (results) => {
            this.render(results);
        });

        console.log('RegressionTable Component Initialized');
    }

    render(data) {
        const { regressionTableHead, regressionTableBody } = this.elements;
        if (!data || !data.regression_results) {
            regressionTableBody.innerHTML = '<tr><td colspan="3">No analysis run.</td></tr>';
            return;
        }

        const { request_params, regression_results } = data;
        const lookbackPeriods = request_params.lookback_periods.sort((a, b) => a - b);

        // Render Header
        regressionTableHead.innerHTML = `
            <tr>
                <th>Timeframe</th>
                ${lookbackPeriods.map(p => `<th>S[${p}]</th>`).join('')}
                <th>R-Value (Avg)</th>
            </tr>`;
            
        // Render Body
        regressionTableBody.innerHTML = regression_results.map(timeframeResult => {
            let totalRValue = 0;
            let rValueCount = 0;

            const slopeCells = lookbackPeriods.map(period => {
                const result = timeframeResult.results[period.toString()];
                if (result) {
                    totalRValue += Math.abs(result.r_value);
                    rValueCount++;
                    const colorClass = result.slope > 0 ? 'text-success' : 'text-error';
                    return `<td class="${colorClass}">${result.slope.toFixed(5)}</td>`;
                }
                return `<td>N/A</td>`;
            }).join('');
            
            const avgRValue = rValueCount > 0 ? (totalRValue / rValueCount).toFixed(4) : 'N/A';

            return `
                <tr>
                    <td>${timeframeResult.timeframe}</td>
                    ${slopeCells}
                    <td>${avgRValue}</td>
                </tr>
            `;
        }).join('');
    }
}

export const regressionTable = new RegressionTable(store);