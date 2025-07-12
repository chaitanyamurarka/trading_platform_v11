// frontend_soa/src/ui/helpers.js
import { getDomElements } from './dom.js';

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