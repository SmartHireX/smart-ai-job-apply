/**
 * Verification Script: Fix for "[object Object]" bug in sectional date fields
 */

const fs = require('fs');
const path = require('path');

// --- MOCK BROWSER ENV ---
global.window = {
    IndexingService: {
        detectIndexFromAttribute: (f) => null,
        detectIndexFromLabel: (l) => null
    }
};
global.document = {
    querySelectorAll: () => [],
    createElement: () => ({ setAttribute: () => { }, appendChild: () => { } })
};
global.console = console;
global.chrome = {
    storage: {
        local: {
            storage: {},
            get: async function (k) {
                if (typeof k === 'string') return { [k]: this.storage[k] || {} };
                return this.storage;
            },
            set: async function (obj) { Object.assign(this.storage, obj); },
            remove: async function (keys) { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete this.storage[k]); }
        }
    }
};
global.window.chrome = global.chrome;

// --- LOAD MODULES ---
const InteractionLog = require('../autofill/domains/heuristics/InteractionLog.js');

async function runTests() {
    console.log('🔍 Starting Date Bug Fix Verification...\n');
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`✅ MATCH: ${message}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${message}`);
            failed++;
        }
    }

    // --- SETUP CACHE ---
    // User data from bug report:
    // parentSection: 'work_experience'
    // index: 1
    // row: {date_end: '22/11', employ_name: 'Flipkarta abc', employer_name: 'Flipkarta abc', job_title: 'abc'}

    const mockRow = {
        date_end: '22/11',
        employ_name: 'Flipkarta abc',
        employer_name: 'Flipkarta abc',
        job_title: 'abc'
    };

    await chrome.storage.local.set({
        SECTION_REPEATER: {
            work_experience: {
                value: [null, mockRow], // Index 1
                fieldType: 'section',
                lastUsed: Date.now()
            }
        }
    });

    // --- CASE 1: Fuzzy Match within Row (job_end_date vs date_end) ---
    console.log('\n--- Case 1: Fuzzy Match within Section Row ---');
    const fieldEnd = {
        name: 'work_1_end',
        label: 'End Date',
        id: 'work_1_end',
        instance_type: 'SECTION_REPEATER',
        field_index: 1,
        section_type: 'work',
        ml_prediction: { label: 'job_end_date', confidence: 0.9 }
    };

    const resultEnd = await InteractionLog.getCachedValue(fieldEnd, 'End Date');
    console.log('Result for job_end_date:', resultEnd);

    assert(resultEnd !== null, 'Should find a value');
    assert(resultEnd?.value === '22/11', `Value should be "22/11" (Got: ${JSON.stringify(resultEnd?.value)})`);
    assert(resultEnd?.source === 'section_row_cache_fuzzy', `Source should be "section_row_cache_fuzzy" (Got: ${resultEnd?.source})`);

    // --- CASE 2: No Match in Row -> Should return null (NO FALLTHROUGH) ---
    console.log('\n--- Case 2: No Match in Row (Sectional Guard) ---');
    const fieldStart = {
        name: 'work_1_start',
        label: 'Start Date',
        id: 'work_1_start',
        instance_type: 'SECTION_REPEATER',
        field_index: 1,
        section_type: 'work',
        ml_prediction: { label: 'job_start_date', confidence: 0.9 }
    };

    const resultStart = await InteractionLog.getCachedValue(fieldStart, 'Start Date');
    console.log('Result for job_start_date (missing in row):', resultStart);

    assert(resultStart === null, 'Should return null for missing field in row instead of falling through to generic matcher');
    assert(typeof resultStart !== 'object' || resultStart === null, 'Should NOT return the whole row object');

    console.log(`\n🎉 Verification Complete: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
