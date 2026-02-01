const HeuristicEngine = require('./autofill/domains/inference/HeuristicEngine.js');

const engine = new HeuristicEngine({ debug: true });

const field = {
    label: "First Name",
    name: "firstName",
    id: "first-name",
    placeholder: "",
    type: "text",
    parentContext: "📝 Text-Based Inputs",
    siblingContext: "*First Name*, Email, Phone"
};

console.log("Testing field:", field);

const result = engine.classify(field);

console.log("Result:", result);

if (!result) {
    console.log("FAILURE: Field was not classified.");
    // specific debug
    const text = engine._buildSearchText(field);
    console.log("Search Text:", text);

    // Check first_name pattern manually
    const firstNameConfig = HeuristicEngine.PATTERNS.first_name;
    console.log("Checking first_name patterns against text...");
    firstNameConfig.patterns.forEach(p => {
        console.log(`Pattern: ${p} -> Match: ${p.test(text)}`);
    });
} else {
    console.log("SUCCESS: Classified as", result.label);
}
