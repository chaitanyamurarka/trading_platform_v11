// frontend_soa/src/ui/settingsDebug.js - Debug helper for settings modal
export function debugSettingsModal() {
    console.group('🔍 Settings Modal Debug');
    
    const modal = document.getElementById('settings_modal');
    if (!modal) {
        console.error('❌ Settings modal not found in DOM');
        console.groupEnd();
        return;
    }
    
    console.log('✅ Modal element found:', modal);
    
    // Check modal state
    const isOpen = modal.hasAttribute('open') || modal.open;
    console.log('📊 Modal open state:', isOpen);
    
    // Check modal box
    const modalBox = modal.querySelector('.modal-box');
    if (!modalBox) {
        console.error('❌ Modal box not found');
    } else {
        console.log('✅ Modal box found:', modalBox);
        
        // Check computed styles
        const modalStyles = window.getComputedStyle(modal);
        const boxStyles = window.getComputedStyle(modalBox);
        
        console.log('🎨 Modal styles:', {
            display: modalStyles.display,
            visibility: modalStyles.visibility,
            opacity: modalStyles.opacity,
            zIndex: modalStyles.zIndex,
            position: modalStyles.position,
            backgroundColor: modalStyles.backgroundColor
        });
        
        console.log('🎨 Modal box styles:', {
            display: boxStyles.display,
            visibility: boxStyles.visibility,
            opacity: boxStyles.opacity,
            backgroundColor: boxStyles.backgroundColor,
            color: boxStyles.color,
            transform: boxStyles.transform,
            width: boxStyles.width,
            height: boxStyles.height
        });
    }
    
    // Check tabs
    const tabs = modal.querySelectorAll('.tab');
    console.log('📑 Tabs found:', tabs.length);
    tabs.forEach((tab, index) => {
        const styles = window.getComputedStyle(tab);
        console.log(`Tab ${index}:`, {
            text: tab.textContent,
            display: styles.display,
            backgroundColor: styles.backgroundColor,
            color: styles.color,
            classes: tab.className
        });
    });
    
    // Check tab contents
    const tabContents = modal.querySelectorAll('.tab-content');
    console.log('📄 Tab contents found:', tabContents.length);
    tabContents.forEach((content, index) => {
        const styles = window.getComputedStyle(content);
        console.log(`Tab content ${index}:`, {
            id: content.id,
            display: styles.display,
            visibility: styles.visibility,
            hidden: content.classList.contains('hidden')
        });
    });
    
    console.groupEnd();
}

// Force modal to be visible with debugging styles
export function forceModalVisible() {
    const modal = document.getElementById('settings_modal');
    if (!modal) return;
    
    console.log('🔧 Forcing modal visibility...');
    
    // Add debug styles
    modal.style.cssText = `
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        z-index: 9999 !important;
        position: fixed !important;
        inset: 0 !important;
        background: rgba(0, 0, 0, 0.5) !important;
        align-items: center !important;
        justify-content: center !important;
    `;
    
    const modalBox = modal.querySelector('.modal-box');
    if (modalBox) {
        modalBox.style.cssText = `
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            background: #1f2937 !important;
            color: white !important;
            padding: 2rem !important;
            border-radius: 0.5rem !important;
            border: 2px solid #3b82f6 !important;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
            transform: none !important;
            max-width: 32rem !important;
            width: 90vw !important;
        `;
    }
    
    console.log('✅ Modal forced visible');
}