/**
 * Verification Script: Workday Date Labeling
 */

const fs = require('fs');
const path = require('path');

// --- MOCK BROWSER ENV ---
global.document = {
    querySelector: (s) => null,
    getElementById: (id) => null
};
global.Node = {
    DOCUMENT_POSITION_FOLLOWING: 4,
    TEXT_NODE: 3
};

// Simplified clean/getVisualLabel from form-detector.js
const clean = (text) => text ? text.replace(/\s+/g, ' ').trim() : '';

function getVisualLabel(element, domWalk) {
    const EXCLUSION_PATTERNS = /autofill|resume|upload|download|attach|button|submit|cancel|^indicates.*required|^[mdy]{1,4}$|month|year|day|date/i;

    // Simulate internal logic
    if (element.labels && element.labels.length > 0) {
        const text = clean(element.labels[0].textContent);
        if (text && !EXCLUSION_PATTERNS.test(text)) return text;
    }

    if (element.hasAttribute('aria-label')) {
        const text = clean(element.getAttribute('aria-label'));
        if (text && !EXCLUSION_PATTERNS.test(text)) return text;
    }

    // Climb parents
    let parent = domWalk.parent;
    while (parent) {
        if (parent.legendText) {
            const text = clean(parent.legendText);
            if (text && !EXCLUSION_PATTERNS.test(text)) return text;
        }
        parent = parent.parent;
    }

    return "Fallback";
}

async function runTests() {
    console.log('🔍 Starting Workday Labeling Verification...\n');

    // Mock Workday Start Date Input
    const mockInput = {
        id: 'workExperience-17--startDate-dateSectionYear-input',
        getAttribute: (attr) => {
            if (attr === 'aria-label') return 'Year';
            if (attr === 'aria-valuetext') return 'YYYY';
            return null;
        },
        hasAttribute: (attr) => attr === 'aria-label' || attr === 'aria-valuetext',
        labels: []
    };

    // Mock DOM hierarchy
    const domWalk = {
        input: mockInput,
        parent: {
            tagName: 'FIELDSET',
            legendText: 'From*',
            parent: null
        }
    };

    console.log('Testing labeling for Start Date Year input...');
    const label = getVisualLabel(mockInput, domWalk);
    console.log('Final Label:', label);

    if (label.includes('From')) {
        console.log('✅ MATCH: Label successfully climbed to "From"');
    } else {
        console.error('❌ FAIL: Label stuck on noise or fallback (Got: ' + label + ')');
    }
}

runTests();
