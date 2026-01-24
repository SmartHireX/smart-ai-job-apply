
// Mock Dependencies
window.CACHE_KEYS = {
    ATOMIC_SINGLE: 'ATOMIC_SINGLE',
    ATOMIC_MULTI: 'ATOMIC_MULTI',
    SECTIONAL_MULTI: 'SECTIONAL_MULTI'
};

// Mock Cache
const mockCache = {
    'SECTIONAL_MULTI': {
        'education': {
            value: [
                { 'field_of_study': 'Computer Science', 'education_level': 'Bachelor' } // Index 0
            ],
            type: 'SECTIONAL_MULTI'
        }
    }
};

// Mock InteractionLog
window.InteractionLog = {
    getCachedValue: async (field) => {
        console.log(`[MockLog] getCachedValue called for ${field.name}`);
        // Simulate SECTIONAL_MULTI lookup logic
        if (field.instance_type === 'SECTIONAL_MULTI') {
            // simplified logic from InteractionLog.js
            if (field.ml_prediction.label === 'major' || field.ml_prediction.label === 'field_of_study') {
                const index = field.field_index;
                const section = mockCache.SECTIONAL_MULTI.education;
                if (section && section.value[index]) {
                    const val = section.value[index]['field_of_study'];
                    console.log(`[MockLog] Found value: ${val}`);
                    return { value: val, confidence: 1.0, source: 'cache_debug' };
                }
            }
        }
        return null;
    }
};

// Mock Handler
window.Handler = class Handler { constructor(name) { this.name = name; } };

// Load SectionController (Copy-Paste of essential parts or assuming loaded)
// We will instantiate SectionController and run handle.

const controller = new window.SectionController();

const mockResumeData = { education: [] }; // Empty resume

const fields = [
    {
        name: 'edu_0_major',
        label: 'Field of Study',
        type: 'text',
        selector: '[name="edu_0_major"]', // Important for mapSection
        instance_type: 'SECTIONAL_MULTI',
        field_index: 0,
        ml_prediction: { label: 'field_of_study', confidence: 0.9 }
    }
];

async function runTest() {
    console.log("Starting Cache Test...");
    const result = await controller.handle(fields, { resumeData: mockResumeData });
    console.log("Result:", result);

    if (result['[name="edu_0_major"]'] && result['[name="edu_0_major"]'].value === 'Computer Science') {
        console.log("✅ TEST PASSED: Fetched from cache despite empty resume.");
    } else {
        console.log("❌ TEST FAILED: Did not fetch from cache.");
    }
}

runTest();
