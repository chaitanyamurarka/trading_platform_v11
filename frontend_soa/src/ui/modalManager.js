// frontend_soa/src/ui/modalManager.js - New file for modal management
class ModalManager {
    constructor() {
        this.openModals = new Set();
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`❌ Modal ${modalId} not found`);
            return false;
        }

        try {
            // Add to tracking
            this.openModals.add(modalId);
            
            // Force visibility first
            this.forceModalVisibility(modal);
            
            // Try native showModal first
            if (typeof modal.showModal === 'function') {
                modal.showModal();
                console.log(`✅ Modal ${modalId} opened with showModal()`);
            } else {
                // Fallback: manually set open attribute
                modal.setAttribute('open', '');
                modal.open = true;
                console.log(`✅ Modal ${modalId} opened with fallback`);
            }
            
            // Setup close handlers
            this.setupCloseHandlers(modal);
            
            return true;
        } catch (error) {
            console.error(`❌ Failed to open modal ${modalId}:`, error);
            // Try fallback method
            return this.fallbackOpen(modal);
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`❌ Modal ${modalId} not found`);
            return false;
        }

        try {
            // Remove from tracking
            this.openModals.delete(modalId);
            
            // Try native close first
            if (typeof modal.close === 'function') {
                modal.close();
                console.log(`✅ Modal ${modalId} closed with close()`);
            } else {
                // Fallback: manually remove open attribute
                modal.removeAttribute('open');
                modal.open = false;
                console.log(`✅ Modal ${modalId} closed with fallback`);
            }
            
            // Hide modal with CSS
            this.hideModal(modal);
            
            return true;
        } catch (error) {
            console.error(`❌ Failed to close modal ${modalId}:`, error);
            // Force hide as fallback
            this.hideModal(modal);
            return false;
        }
    }

    forceModalVisibility(modal) {
        if (!modal) return;
        
        // Remove hidden classes
        modal.classList.remove('hidden', 'invisible');
        
        // Force visibility with CSS
        modal.style.cssText = `
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            z-index: 9999 !important;
            position: fixed !important;
            inset: 0 !important;
            background: rgba(0, 0, 0, 0.7) !important;
            align-items: center !important;
            justify-content: center !important;
            backdrop-filter: blur(4px) !important;
            pointer-events: auto !important;
        `;
        
        const modalBox = modal.querySelector('.modal-box');
        if (modalBox) {
            modalBox.style.cssText = `
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                background: #1f2937 !important;
                color: #ffffff !important;
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
                pointer-events: auto !important;
            `;
        }
    }

    hideModal(modal) {
        if (!modal) return;
        
        // Hide with animation
        modal.style.cssText = `
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
        `;
        
        console.log('✅ Modal hidden with CSS');
    }

    fallbackOpen(modal) {
        console.log('🔄 Using fallback modal open...');
        
        // Set open manually
        modal.setAttribute('open', '');
        modal.open = true;
        
        // Force visibility
        this.forceModalVisibility(modal);
        
        // Setup close handlers
        this.setupCloseHandlers(modal);
        
        return true;
    }

    setupCloseHandlers(modal) {
        if (!modal) return;
        
        const modalId = modal.id;
        
        // Remove existing listeners to avoid duplicates
        this.removeCloseHandlers(modal);
        
        // Close button handler
        const closeButtons = modal.querySelectorAll('button[type="button"], .btn:not(.btn-primary), form[method="dialog"] button');
        closeButtons.forEach(button => {
            const closeHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔘 Close button clicked');
                this.closeModal(modalId);
            };
            
            button.addEventListener('click', closeHandler);
            button._closeHandler = closeHandler; // Store for removal
        });
        
        // Backdrop click handler
        const backdropElements = modal.querySelectorAll('.modal-backdrop, form[method="dialog"]');
        backdropElements.forEach(backdrop => {
            const backdropHandler = (e) => {
                if (e.target === backdrop) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔘 Backdrop clicked');
                    this.closeModal(modalId);
                }
            };
            
            backdrop.addEventListener('click', backdropHandler);
            backdrop._backdropHandler = backdropHandler; // Store for removal
        });
        
        // ESC key handler
        const escHandler = (e) => {
            if (e.key === 'Escape' && this.openModals.has(modalId)) {
                e.preventDefault();
                e.stopPropagation();
                console.log('⌨️ ESC key pressed');
                this.closeModal(modalId);
            }
        };
        
        document.addEventListener('keydown', escHandler);
        modal._escHandler = escHandler; // Store for removal
        
        console.log('✅ Close handlers setup for modal:', modalId);
    }

    removeCloseHandlers(modal) {
        if (!modal) return;
        
        // Remove close button handlers
        const closeButtons = modal.querySelectorAll('button');
        closeButtons.forEach(button => {
            if (button._closeHandler) {
                button.removeEventListener('click', button._closeHandler);
                delete button._closeHandler;
            }
        });
        
        // Remove backdrop handlers
        const backdropElements = modal.querySelectorAll('.modal-backdrop, form[method="dialog"]');
        backdropElements.forEach(backdrop => {
            if (backdrop._backdropHandler) {
                backdrop.removeEventListener('click', backdrop._backdropHandler);
                delete backdrop._backdropHandler;
            }
        });
        
        // Remove ESC handler
        if (modal._escHandler) {
            document.removeEventListener('keydown', modal._escHandler);
            delete modal._escHandler;
        }
    }

    closeAllModals() {
        const openModalIds = Array.from(this.openModals);
        openModalIds.forEach(modalId => {
            this.closeModal(modalId);
        });
    }

    isModalOpen(modalId) {
        return this.openModals.has(modalId);
    }

    getOpenModals() {
        return Array.from(this.openModals);
    }
}

// Export singleton instance
export const modalManager = new ModalManager();

// Helper functions for easy use
export function openModal(modalId) {
    return modalManager.openModal(modalId);
}

export function closeModal(modalId) {
    return modalManager.closeModal(modalId);
}

export function closeAllModals() {
    return modalManager.closeAllModals();
}