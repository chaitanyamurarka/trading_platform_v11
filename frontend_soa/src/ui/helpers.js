// Add to frontend_soa/src/ui/helpers.js

import { getDomElements } from './dom.js';
import { store } from '../state/store.js';

export function setAutomaticDateTime() {
    const selectedTimezone = store.get('selectedTimezone') || 'America/New_York';
    
    const now = new Date();
    const nyParts = getDatePartsInZone(now, 'America/New_York');
    
    // Create a Date object representing 8:00 PM New York time
    const eightPMNY = new Date(Date.UTC(nyParts.year, nyParts.month - 1, nyParts.day, 0, 0, 0));
    eightPMNY.setUTCHours(getUTCHourOffset('America/New_York', 20, now));
    
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
    
    // Store in the state
    store.set('startTime', startFormatted);
    store.set('endTime', endFormatted);
    
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

/**
 * Displays a toast message.
 * @param {string} message The message to display.
 * @param {'info'|'success'|'warning'|'error'} type The type of toast.
 */
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    const alertType = `alert-${type}`;
    
    toast.className = `alert ${alertType} shadow-lg transition-all duration-300 opacity-0 transform translate-y-2`;
    toast.innerHTML = `<span>${message}</span>`;
    toastContainer.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0', 'translate-y-2');
    });

    // Auto-dismiss
    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Populates the exchange select dropdown from the list of symbols.
 * @param {Array<{symbol: string, exchange: string}>} symbols - An array of symbol objects.
 */
export function populateExchangeSelect(symbols) {
    const { exchangeSelect } = getDomElements();
    if (!exchangeSelect) return;

    exchangeSelect.innerHTML = ''; // Clear existing options

    // Get unique exchanges from the symbols list
    const exchanges = [...new Set(symbols.map(s => s.exchange))];

    exchanges.forEach(exchange => {
        const option = document.createElement('option');
        option.value = exchange;
        option.textContent = exchange;
        exchangeSelect.appendChild(option);
    });
}

/**
 * Populates the symbol select dropdown.
 * @param {Array<{symbol: string}>} symbols - An array of symbol objects.
 */
export function populateSymbolSelect(symbols) {
    const { symbolSelect } = getDomElements();
    if (!symbolSelect) return;
    
    symbolSelect.innerHTML = ''; // Clear existing options
    
    symbols.forEach(s => {
        const option = document.createElement('option');
        option.value = s.symbol;
        option.textContent = s.symbol;
        symbolSelect.appendChild(option);
    });
}