try {
    const FieldTypes = require('./autofill/domains/inference/FieldTypes.js');
    console.log("FieldTypes loaded successfully.");
    console.log("Class count:", FieldTypes.getClassCount());
} catch (e) {
    console.error("Syntax Error in FieldTypes.js:", e);
}
