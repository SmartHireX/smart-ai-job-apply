/**
 * content.js
 * Ultra-thin orchestrator for the Smart AI Job Apply extension
 * 
 * All complex logic has been moved to specialized modules:
 * - Infrastructure: constants, config, lifecycle
 * - Messaging: message router and handlers
 * - Workflows: form processing phases (0, 1, 2)
 * - Features: undo, self-healing, AI regeneration
 * - Utils: memory and field utilities
 * 
 * This file only handles:
 * - Extension initialization
 * - Global API exports for backward compatibility
 */

// console.log('Nova AI Extension Loaded');

// ============ INITIALIZATION ============

// Initialize lifecycle (service registration, event listeners)
if (window.NovaLifecycle) {
    window.NovaLifecycle.init().catch(error => {
        console.error('❌ Lifecycle initialization failed:', error);
    });
}

// Register message handlers
if (window.MessageRouter) {
    window.MessageRouter.registerHandlers();
}

// ============ LEGACY GLOBAL EXPORTS ============
// These maintain backward compatibility with existing UI components

// Form Processing
window.processPageFormLocal = async function () {
    if (window.FormProcessor) {
        return await window.FormProcessor.process();
    } else {
        console.error('❌ FormProcessor not available');
    }
};

// Undo
window.undoFormFill = function () {
    if (window.UndoManager) {
        return window.UndoManager.undo();
    }
    return { success: false, message: 'UndoManager not available' };
};

// Smart Memory
// Smart Memory
window.updateSmartMemoryCache = async function (newEntries) {
    if (window.GlobalMemory) {
        return await window.GlobalMemory.updateCache(newEntries);
    }
    console.error('❌ GlobalMemory (SmartMemory) not available');
};

window.normalizeSmartMemoryKey = function (label) {
    if (window.GlobalMemory) {
        return window.GlobalMemory.normalizeKey(label);
    }
    return label;
};

// Field Utilities
window.isFieldVisible = function (element) {
    if (window.FieldUtils) {
        return window.FieldUtils.isFieldVisible(element);
    }
    return false;
};

window.getFieldLabel = function (element) {
    if (window.FieldUtils) {
        return window.FieldUtils.getFieldLabel(element);
    }
    return '';
};

window.captureFieldState = function (element) {
    if (window.FieldUtils) {
        return window.FieldUtils.captureFieldState(element);
    }
    return null;
};

window.setNativeValue = function (element, value) {
    if (window.FieldUtils) {
        window.FieldUtils.setNativeValue(element, value);
    }
};

window.dispatchChangeEvents = function (element) {
    if (window.FieldUtils) {
        window.FieldUtils.dispatchChangeEvents(element);
    }
};

// Self-Healing
window.attachSelfHealingObserver = function () {
    if (window.SelfHealing) {
        window.SelfHealing.start();
    }
};

// AI Regeneration
window.regenerateFieldWithAI = async function (selector, label, customInstruction = '') {
    if (window.AIRegeneration) {
        return await window.AIRegeneration.regenerate(selector, label, customInstruction);
    }
    console.error('❌ AIRegeneration not available');
};

// ============ LEGACY STATE ============
// Maintain global state for backward compatibility
window.activeFormUndoHistory = [];

// console.log('✅ Content script initialized');
