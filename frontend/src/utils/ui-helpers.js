// app/4-ui-helpers.js
import { getDomElements } from './dom-elements.js';
import { getChartTheme } from './chart-options.js';
import { state } from './state.js';

const elements = getDomElements();


export function setAutomaticDateTime(elementsObj) {
    const elementsRef = elementsObj || getDomElements();
    const selectedTimezone = elementsRef.timezoneSelect.value || 'America/New_York';

    const now = new Date();
    const nyParts = getDatePartsInZone(now, 'America/New_York');

    // Create a Date object representing 8:00 PM New York time
    const eightPMNY = new Date(Date.UTC(nyParts.year, nyParts.month - 1, nyParts.day, 0, 0, 0));
    eightPMNY.setUTCHours(getUTCHourOffset('America/New_York', 20, now));

    // If NY current date is same but time < 20:00 → subtract a day
    const currentNY = new Date();
    const currentParts = getDatePartsInZone(currentNY, 'America/New_York');

    if (currentParts.year === nyParts.year && currentParts.month === nyParts.month && currentParts.day === nyParts.day) {
        const nowNY = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const endNY = new Date(nowNY);
        endNY.setHours(20, 0, 0, 0); // set 8 PM NY today

        if (nowNY < endNY) {
            endNY.setDate(endNY.getDate() - 1);
        }
    }

    const finalEndUTC = new Date(eightPMNY);
    const finalStartUTC = new Date(finalEndUTC);
    finalStartUTC.setUTCDate(finalEndUTC.getUTCDate() - 30);

    const startFormatted = formatDateInZone(finalStartUTC, selectedTimezone);
    const endFormatted = formatDateInZone(finalEndUTC, selectedTimezone);

    elementsRef.startTimeInput.value = startFormatted;
    elementsRef.endTimeInput.value = endFormatted;

    console.log(`[${selectedTimezone}] Start: ${startFormatted}, End: ${endFormatted}`);
}

function formatDateInZone(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hour12: false
    }).formatToParts(date);

    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function getCurrentHourInTimezone(timeZone) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        hour12: false
    }).formatToParts(now);
    return parseInt(parts.find(p => p.type === 'hour').value, 10);
}

function getDatePartsInZone(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);

    return Object.fromEntries(parts.map(p => [p.type, parseInt(p.value, 10)]));
}

function getUTCHourOffset(timeZone, targetHourInZone, referenceDate) {
    const testDate = new Date(referenceDate);
    testDate.setUTCHours(0, 0, 0, 0); // midnight UTC

    const zoneHour = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        hour12: false
    }).formatToParts(testDate).find(p => p.type === 'hour').value;

    const offset = targetHourInZone - parseInt(zoneHour, 10);
    return 0 + offset;
}

export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `alert alert-${type} shadow-lg transition-opacity duration-300 opacity-0`;
    toast.innerHTML = `<span>${message}</span>`;

    toastContainer.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0');
        toast.classList.add('opacity-100');
    });

    // Auto-dismiss after 4s
    setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// export function updateDataSummary(latestData) {
//     if (!elements.dataSummaryElement || !latestData) return;
//     const change = latestData.close - latestData.open;
//     const changePercent = (change / latestData.open) * 100;
//     elements.dataSummaryElement.innerHTML = `
//         <strong>${elements.symbolSelect.value} (${elements.exchangeSelect.value})</strong> | C: ${latestData.close.toFixed(2)} | H: ${latestData.high.toFixed(2)} | L: ${latestData.low.toFixed(2)} | O: ${latestData.open.toFixed(2)}
//         <span class="${change >= 0 ? 'text-success' : 'text-error'}">(${change.toFixed(2)} / ${changePercent.toFixed(2)}%)</span>`;
// }

export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chartTheme', theme);
    if (state.mainChart) state.mainChart.applyOptions(getChartTheme(theme));
    syncSettingsInputs();
}

export function syncSettingsInputs(stateObj, elementsObj) {
    const stateRef = stateObj || state;
    const elementsRef = elementsObj || getDomElements();
    const currentTheme = getChartTheme(localStorage.getItem('chartTheme') || 'light');
    elementsRef.gridColorInput.value = currentTheme.grid.vertLines.color;
    elementsRef.upColorInput.value = '#10b981';
    elementsRef.downColorInput.value = '#ef4444';
    elementsRef.wickUpColorInput.value = '#10b981';
    elementsRef.wickDownColorInput.value = '#ef4444';
    elementsRef.volUpColorInput.value = '#10b981';
    elementsRef.volDownColorInput.value = '#ef4444';
}

export function updateThemeToggleIcon(elementsObj) {
    const elementsRef = elementsObj || getDomElements();
    const theme = document.documentElement.getAttribute('data-theme');
    const toggleCheckbox = elementsRef.themeToggle.querySelector('input[type="checkbox"]');
    
    if (toggleCheckbox) {
        // The "swap-on" (sun icon) should be active when the theme is dark.
        // The checkbox being 'checked' activates "swap-on".
        toggleCheckbox.checked = theme === 'dark';
    }
}

export function populateSymbolSelect(symbols, elementsObj) {
    const elementsRef = elementsObj || getDomElements();
    // Clear existing options
    elementsRef.symbolSelect.innerHTML = '';

    // Add a default, disabled option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select Symbol';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    elementsRef.symbolSelect.appendChild(defaultOption);

    // Add symbols from the fetched list
    symbols.forEach(s => {
        const option = document.createElement('option');
        option.value = s.symbol; // Assuming 'symbol' is the key for the symbol string
        option.textContent = s.symbol; // Display the symbol string
        elementsRef.symbolSelect.appendChild(option);
    });

    // Automatically select the first symbol if available
    if (symbols.length > 0) {
        elementsRef.symbolSelect.value = symbols[0].symbol;
        // Dispatch a change event to trigger any listeners (e.g., data loading)
        // elements.symbolSelect.dispatchEvent(new Event('change'));
    }
}

window.showToast = showToast;

/**
 * FIXED: Populates the regression analysis results table with proper alignment and colors.
 * @param {object} data - The response data from the /regression API endpoint.
 */
export function populateRegressionTable(data) {
    if (!elements.regressionTableContainer || !elements.regressionTableHead || !elements.regressionTableBody) return;

    if (!data) {
        elements.regressionTableBody.innerHTML = '<tr><td colspan="10" class="text-center p-4">No data to display.</td></tr>';
        elements.regressionTableContainer.classList.add('hidden');
        return;
    }

    const { request_params, regression_results } = data;
    if (!regression_results || regression_results.length === 0) {
        elements.regressionTableBody.innerHTML = '<tr><td colspan="10" class="text-center p-4">No regression results returned for the selected parameters.</td></tr>';
        elements.regressionTableContainer.classList.remove('hidden');
        return;
    }

    // Sort lookback periods in descending order
    const sortedLookbackPeriods = [...request_params.lookback_periods].sort((a, b) => b - a);

    // Build Table Header
    elements.regressionTableHead.innerHTML = '';
    const headerRow = document.createElement('tr');
    
    // FIXED: Sr. No. column (sticky left)
    const srNoTh = document.createElement('th');
    srNoTh.textContent = 'Sr. No.';
    srNoTh.className = 'sticky left-0 border-r border-base-300';
    headerRow.appendChild(srNoTh);

    // FIXED: Timeframe column (sticky left)
    const timeframeTh = document.createElement('th');
    timeframeTh.textContent = 'Timeframe';
    timeframeTh.className = 'sticky left-16 border-r border-base-300';
    headerRow.appendChild(timeframeTh);

    // Scrollable slope columns (in descending order)
    const maxVisibleSlopes = 5;
    sortedLookbackPeriods.forEach((period, index) => {
        const th = document.createElement('th');
        th.textContent = `S[${period}]`;
        th.className = 'text-center';
        
        // Hide columns beyond the visible limit initially
        if (index >= maxVisibleSlopes) {
            th.style.display = 'none';
            th.classList.add('hidden-slope-column');
        }
        
        headerRow.appendChild(th);
    });

    // FIXED: R-Value column (sticky right)
    const rValueTh = document.createElement('th');
    rValueTh.textContent = 'R-Value (Avg)';
    rValueTh.className = 'sticky right-0 border-l border-base-300';
    headerRow.appendChild(rValueTh);

    elements.regressionTableHead.appendChild(headerRow);

    // Build Table Body
    elements.regressionTableBody.innerHTML = '';
    regression_results.forEach((timeframeResult, index) => {
        const row = document.createElement('tr');
        
        // FIXED: Sr. No. cell (sticky left)
        const srCell = row.insertCell();
        srCell.textContent = index + 1;
        srCell.className = 'sticky left-0 border-r border-base-300';
        
        // FIXED: Timeframe cell (sticky left)
        const timeframeCell = row.insertCell();
        timeframeCell.textContent = timeframeResult.timeframe;
        timeframeCell.className = 'sticky left-16 border-r border-base-300';

        let totalRValue = 0;
        let rValueCount = 0;

        // Slope values for each lookback (in descending order)
        sortedLookbackPeriods.forEach((period, colIndex) => {
            const slopeTd = row.insertCell();
            const result = timeframeResult.results[period.toString()];
            if (result) {
                slopeTd.textContent = result.slope.toFixed(5);
                // FIXED: Use proper color classes without background
                slopeTd.className = result.slope > 0 
                    ? 'text-success text-center font-medium' 
                    : 'text-error text-center font-medium';
                totalRValue += Math.abs(result.r_value);
                rValueCount++;
            } else {
                slopeTd.textContent = 'N/A';
                slopeTd.className = 'text-center text-base-content/60';
            }
            
            // Hide columns beyond the visible limit
            if (colIndex >= maxVisibleSlopes) {
                slopeTd.style.display = 'none';
                slopeTd.classList.add('hidden-slope-column');
            }
        });

        // FIXED: R-Value cell (sticky right)
        const rValueTd = row.insertCell();
        if (rValueCount > 0) {
            const avgRValue = totalRValue / rValueCount;
            rValueTd.textContent = avgRValue.toFixed(4);
            rValueTd.className = 'text-center font-medium';
        } else {
            rValueTd.textContent = 'N/A';
            rValueTd.className = 'text-center text-base-content/60';
        }
        rValueTd.classList.add('sticky', 'right-0', 'border-l', 'border-base-300');
        
        elements.regressionTableBody.appendChild(row);
    });

    // Add scroll controls if there are more than maxVisibleSlopes
    if (sortedLookbackPeriods.length > maxVisibleSlopes) {
        addTableScrollControls(sortedLookbackPeriods, maxVisibleSlopes);
    }

    elements.regressionTableContainer.classList.remove('hidden');
}

/**
 * FIXED: Adds scroll controls with proper styling
 */
function addTableScrollControls(sortedLookbackPeriods, maxVisibleSlopes) {
    // Remove existing controls if any
    const existingControls = elements.regressionTableContainer.querySelector('.table-scroll-controls');
    if (existingControls) {
        existingControls.remove();
    }

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'table-scroll-controls flex items-center justify-between mt-3';
    
    const totalColumns = sortedLookbackPeriods.length;
    // Start at the last page to show the most recent lookback periods first
    let currentStartIndex = Math.max(0, totalColumns - maxVisibleSlopes);
    
    const infoSpan = document.createElement('span');
    infoSpan.className = 'text-sm text-base-content/80 font-medium';
    
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'flex gap-2';

    // FIXED: Better button styling
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn btn-sm btn-outline';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> Previous';
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-sm btn-outline';
    nextBtn.innerHTML = 'Next <i class="fas fa-chevron-right"></i>';

    const showAllBtn = document.createElement('button');
    showAllBtn.className = 'btn btn-sm btn-ghost';
    showAllBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i> Show All';

    function updateDisplay() {
        const endIndex = Math.min(currentStartIndex + maxVisibleSlopes, totalColumns);
        const startPeriod = sortedLookbackPeriods[currentStartIndex];
        const endPeriod = sortedLookbackPeriods[endIndex - 1];
        
        infoSpan.textContent = `Showing S[${startPeriod}] to S[${endPeriod}] (${endIndex - currentStartIndex} of ${totalColumns} columns)`;
        
        // Update button states
        prevBtn.disabled = currentStartIndex === 0;
        nextBtn.disabled = endIndex >= totalColumns;
        
        // Show/hide appropriate columns
        const table = elements.regressionTable;
        if (!table) return;
        
        // Update header columns
        const headerCells = table.querySelectorAll('thead th:not(.sticky)');
        headerCells.forEach((cell, index) => {
            if (index >= currentStartIndex && index < currentStartIndex + maxVisibleSlopes) {
                cell.style.display = '';
                cell.classList.remove('hidden-slope-column');
            } else {
                cell.style.display = 'none';
                cell.classList.add('hidden-slope-column');
            }
        });
        
        // Update body columns
        const bodyRows = table.querySelectorAll('tbody tr');
        bodyRows.forEach(row => {
            const cells = row.querySelectorAll('td:not(.sticky)');
            cells.forEach((cell, index) => {
                if (index >= currentStartIndex && index < currentStartIndex + maxVisibleSlopes) {
                    cell.style.display = '';
                    cell.classList.remove('hidden-slope-column');
                } else {
                    cell.style.display = 'none';
                    cell.classList.add('hidden-slope-column');
                }
            });
        });
    }

    prevBtn.addEventListener('click', () => {
        if (currentStartIndex > 0) {
            currentStartIndex = Math.max(0, currentStartIndex - maxVisibleSlopes);
            updateDisplay();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentStartIndex + maxVisibleSlopes < totalColumns) {
            currentStartIndex = Math.min(totalColumns - maxVisibleSlopes, currentStartIndex + maxVisibleSlopes);
            updateDisplay();
        }
    });

    showAllBtn.addEventListener('click', () => {
        const table = elements.regressionTable;
        if (!table) return;
        
        const allHiddenCells = table.querySelectorAll('.hidden-slope-column');
        const isShowingAll = allHiddenCells.length === 0;
        
        if (isShowingAll) {
            // Hide columns beyond maxVisibleSlopes
            currentStartIndex = 0;
            updateDisplay();
            showAllBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i> Show All';
        } else {
            // Show all columns
            allHiddenCells.forEach(cell => {
                cell.style.display = '';
                cell.classList.remove('hidden-slope-column');
            });
            infoSpan.textContent = `Showing all ${totalColumns} slope columns`;
            showAllBtn.innerHTML = '<i class="fas fa-compress-arrows-alt"></i> Show Less';
        }
    });

    buttonsDiv.appendChild(prevBtn);
    buttonsDiv.appendChild(nextBtn);
    buttonsDiv.appendChild(showAllBtn);
    
    controlsDiv.appendChild(infoSpan);
    controlsDiv.appendChild(buttonsDiv);
    
    elements.regressionTableContainer.appendChild(controlsDiv);
    
    // Initial display update
    updateDisplay();
}