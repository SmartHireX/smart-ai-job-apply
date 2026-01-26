/**
 * Verification Script: Structural Routing & Tiered Refinement
 */

const fs = require('fs');
const path = require('path');

// --- MOCK BROWSER ENV ---
global.window = {};
global.document = {
    querySelectorAll: () => [],
    createElement: () => ({ setAttribute: () => { }, appendChild: () => { } })
};
global.console = console;
global.chrome = {
    storage: {
        local: {
            storage: {},
            get: async function (k) { return this.storage; },
            set: async function (obj) { Object.assign(this.storage, obj); }
        }
    }
};
global.window.chrome = global.chrome;

// --- LOAD MODULES ---
const FieldRoutingPatterns = require('../autofill/domains/model/FieldRoutingPatterns.js');
const InteractionLog = require('../autofill/domains/heuristics/InteractionLog.js');

// Mock IndexingService with Source Metadata
global.window.IndexingService = {
    getIndex: (f) => {
        if (f.indexSource === 'STRUCTURAL') return { index: f.field_index, confidence: 3, source: 'STRUCTURAL' };
        if (f.indexSource === 'SYNTHETIC') return { index: f.field_index, confidence: 1, source: 'SYNTHETIC' };
        return { index: null, confidence: 0, source: 'NONE' };
    }
};

// --- HELPERS ---
function createField(overrides = {}) {
    return {
        name: 'test_field',
        label: 'Test Field',
        type: 'text',
        field_index: null,
        indexSource: 'NONE',
        ...overrides
    };
}

async function runTests() {
    console.log('🔍 Starting Refined Structural Routing Verification...\n');
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

    function classify(field, groupCount = 1) {
        field.instance_type = FieldRoutingPatterns.classifyInstanceType(field, groupCount);
        field.scope = FieldRoutingPatterns.classifyScope(field);
        return field;
    }

    // --- TEST 1: TIER 1 - STRUCTURAL REPEATER ---
    console.log('--- Test 1: Tier 1 (Structural Multi) ---');
    const workdayJob = createField({
        label: 'Job Title',
        id: 'workExperience-0--title',
        field_index: 0,
        indexSource: 'STRUCTURAL', // Gives +10 score, +1 signal
        isStrongRepeater: true,     // Gives +10 score, +1 signal
        type: 'text'
    });
    classify(workdayJob);

    assert(workdayJob.instance_type === 'SECTION_REPEATER', `Workday field should be Tier 1 REPEATER (Got: ${workdayJob.instance_type})`);
    assert(workdayJob.structuralSignalCount >= 2, `Tier 1 requires >= 2 signals (Got: ${workdayJob.structuralSignalCount})`);

    // --- TEST 2: TIER 2 - VERIFIED MULTI ---
    console.log('\n--- Test 2: Tier 2 (Verified Multi) ---');
    const recurringEdu = createField({
        label: 'School Name',
        field_index: 0,
        indexSource: 'SYNTHETIC', // Gives +1 score, 0 signals
        type: 'text'
    });
    // With groupCount = 2, it should be promoted to REPEATER
    classify(recurringEdu, 2);
    assert(recurringEdu.instance_type === 'SECTION_REPEATER', `Recurring edu should be Tier 2 REPEATER (Got: ${recurringEdu.instance_type})`);

    // --- TEST 3: PROBATION - SECTION CANDIDATE ---
    console.log('\n--- Test 3: Probation (Section Candidate) ---');
    const solitaryEdu = createField({
        label: 'School Name',
        field_index: 0,
        indexSource: 'SYNTHETIC',
        type: 'text'
    });
    // With groupCount = 1, it stays on Probation
    classify(solitaryEdu, 1);
    assert(solitaryEdu.instance_type === 'SECTION_CANDIDATE', `Solitary indexed edu should be CANDIDATE (Got: ${solitaryEdu.instance_type})`);
    assert(solitaryEdu.scope === 'SECTION', `Candidate should keep SECTION scope`);

    // --- TEST 4: ATOMIC FALLBACK ---
    console.log('\n--- Test 4: Tier 3 (Atomic Fallback) ---');
    const genericField = createField({
        label: 'Tell us about yourself',
        type: 'textarea'
    });
    classify(genericField);
    assert(genericField.instance_type === 'ATOMIC_SINGLE', `Generic field is ATOMIC_SINGLE`);
    assert(genericField.scope === 'GLOBAL', `Generic field is GLOBAL scope`);

    // --- TEST 5: CACHING & COLLISION ---
    console.log('\n--- Test 5: Scoped Caching ---');
    // Clear mock storage
    global.chrome.storage.local.storage = {};

    // 1. Candidate Field (Edu 0)
    solitaryEdu.section_type = 'education';
    await InteractionLog.cacheSelection(solitaryEdu, 'School Name', 'Stanford');

    // 2. Global Field with same label
    const globalSchool = createField({ label: 'School Name', type: 'text' });
    classify(globalSchool);
    await InteractionLog.cacheSelection(globalSchool, 'School Name', 'MIT');

    const sel = global.chrome.storage.local.storage.ATOMIC_SINGLE || {};
    const keys = Object.keys(sel);

    console.log('Cache Keys:', keys);

    const hasScoped = keys.some(k => k.toLowerCase().includes('section:education_0'));
    const hasGlobal = keys.some(k => !k.includes('SECTION:'));

    assert(hasScoped, 'Found scoped key for Candidate field');
    assert(hasGlobal, 'Found global key for solitary field');
    assert(keys.length === 2, 'Two distinct keys created (No collision)');

    console.log(`\n🎉 Verification Complete: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
