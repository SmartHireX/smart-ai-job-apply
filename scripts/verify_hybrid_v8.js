const fs = require('fs');
const path = require('path');

// ==========================================
// 1. ENVIRONMENT MOCKS
// ==========================================
global.window = {};
global.performance = { now: () => Date.now() };

// Mock Chrome API
global.chrome = {
    runtime: {
        getURL: (p) => p // Just return the path
    }
};

// Mock Fetch for local file loading
global.fetch = async (url) => {
    if (url.endsWith('model_v8.json')) {
        const filePath = path.join(__dirname, '../autofill/domains/inference/model_v8.json');
        const content = fs.readFileSync(filePath, 'utf8');
        return {
            json: async () => JSON.parse(content)
        };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
};

// ==========================================
// 2. LOAD MODULES
// ==========================================
const FieldTypes = require('../autofill/domains/inference/FieldTypes.js');
const FeatureExtractor = require('../autofill/domains/inference/feature-extractor.js');
const NeuralClassifierV8 = require('../autofill/domains/inference/neural-classifier-v8.js');
const HeuristicEngine = require('../autofill/domains/inference/HeuristicEngine.js');
const HybridClassifier = require('../autofill/domains/inference/HybridClassifier.js');

// Inject into window for HybridClassifier auto-discovery
window.NeuralClassifierV8 = NeuralClassifierV8;
window.HeuristicEngine = HeuristicEngine;
window.FeatureExtractor = FeatureExtractor;
window.FieldTypes = FieldTypes;
global.FieldTypes = FieldTypes; // CRITICAL: For NeuralClassifierV8 class mapping in Node

// ==========================================
// 3. RUN VERIFICATION
// ==========================================
async function runVerification() {
    console.log('🚀 Verifying HybridClassifier + Neural V8 Integration...');

    const hybrid = new HybridClassifier({
        debug: true
    });

    // Test Case 1: Last Name (Neural should be strong here)
    const lastNameField = {
        name: 'lastName',
        id: 'lastName',
        label: 'Last Name',
        parentContext: 'Personal Information',
        siblingContext: '',
        placeholder: 'Enter your last name',
        type: 'text'
    };

    console.log(`\n--------------------------------------------------`);
    console.log(`🧪 Testing: ${lastNameField.label}`);
    const result1 = await hybrid.classify(lastNameField);
    console.log(`   Final Verdict: [${result1.label}] (Conf: ${result1.confidence.toFixed(4)})`);
    console.log(`   Source: ${result1.source}`);
    console.log(`   Scores -> Heuristic: ${result1.heuristicConfidence?.toFixed(4) || 'N/A'} | Neural: ${result1.neuralConfidence?.toFixed(4) || 'N/A'}`);

    // Neural must be confident (>0.8) even if heuristic wins
    // Note: neuralConfidence might be undefined if heuristics won unanimously, 
    // but HybridClassifier usually calculates both unless unavailable.
    // Actually, HybridClassifier always runs both in parallel.

    if (result1.label === 'last_name') {
        if (result1.neuralConfidence > 0.8) {
            console.log('✅ SUCCESS: Correctly Classified & Neural is Confident');
        } else {
            console.log('⚠️ WARNING: Classified correctly but Neural confidence lower/missing (Check logs)');
        }
    } else {
        console.log('❌ FAILURE: Wrong label');
    }

    // Test Case 2: Email (Both should agree)
    const emailField = {
        name: 'email',
        id: 'email',
        label: 'Email Address',
        parentContext: 'Contact Info',
        siblingContext: '',
        placeholder: 'test@example.com',
        type: 'email'
    };

    console.log(`\n--------------------------------------------------`);
    console.log(`🧪 Testing: ${emailField.label}`);
    const result2 = await hybrid.classify(emailField);
    console.log(`   Final Verdict: [${result2.label}] (Conf: ${result2.confidence.toFixed(4)})`);
    console.log(`   Source: ${result2.source}`);
    console.log(`   Scores -> Heuristic: ${result2.heuristicConfidence?.toFixed(4) || 'N/A'} | Neural: ${result2.neuralConfidence?.toFixed(4) || 'N/A'}`);

    if (result2.label === 'email') {
        console.log('✅ SUCCESS: Correctly Classified');
    }

    // Test Case 3: Ambiguous Field
    const jobField = {
        name: 'title',
        id: 'job_title',
        label: 'Job Title',
        parentContext: 'Work Experience',
        siblingContext: '',
        placeholder: 'Software Engineer',
        type: 'text'
    };

    console.log(`\n--------------------------------------------------`);
    console.log(`🧪 Testing: ${jobField.label}`);
    const result3 = await hybrid.classify(jobField);
    console.log(`   Final Verdict: [${result3.label}] (Conf: ${result3.confidence.toFixed(4)})`);
    console.log(`   Source: ${result3.source}`);
    console.log(`   Scores -> Heuristic: ${result3.heuristicConfidence?.toFixed(4) || 'N/A'} | Neural: ${result3.neuralConfidence?.toFixed(4) || 'N/A'}`);

    if (result3.label === 'job_title') {
        console.log('✅ SUCCESS: Correctly Classified');
    }

    // Test Case 4: Skills Checkbox (The Bug Regression Test)
    console.log('\n--------------------------------------------------');
    console.log('🧪 Testing: Skills Checkbox (Regression)');
    const skillsField = {
        label: 'JavaScript',
        name: 'skills',
        id: 'skill_js',
        type: 'checkbox',
        parentContext: '🛠️ Technical Skills',
        // Mock Element for deep inspection if needed
        element: {
            tagName: 'INPUT',
            type: 'checkbox',
            getAttribute: () => null
        }
    };
    const skillsResult = await hybrid.classify(skillsField);
    console.log(`   Final Verdict: [${skillsResult.label}] (Conf: ${skillsResult.confidence.toFixed(4)})`);
    console.log(`   Source: ${skillsResult.source}`);
    console.log(`   Scores -> Heuristic: ${skillsResult.heuristicConfidence?.toFixed(4) || 'N/A'} | Neural: ${skillsResult.neuralConfidence?.toFixed(4) || 'N/A'}`);

    if (skillsResult.label === 'skills' || skillsResult.label === 'technical_skills') {
        console.log('✅ SUCCESS: Identified as Skills (Fix Verified)');
    } else {
        console.error('❌ FAILURE: Still Unknown or Wrong Class');
    }
}

runVerification().catch(console.error);
