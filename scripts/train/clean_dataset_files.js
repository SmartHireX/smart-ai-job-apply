const fs = require('fs');
const path = require('path');

const DATA_DIRS = [
    path.join(__dirname, 'train-dataset'),
    __dirname
];

const FILES_TO_CHECK = [
    'train-dataset-augmented.json',
    'llm_generated_data.json'
];

async function cleanFiles() {
    // console.log('🧹 Starting cleanup of "work_style" from dataset files...');
    let totalRemoved = 0;

    // 1. Process batch files in train-dataset/
    const batchDir = path.join(__dirname, 'train-dataset');
    if (fs.existsSync(batchDir)) {
        const files = fs.readdirSync(batchDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const filePath = path.join(batchDir, file);
            await processFile(filePath);
        }
    }

    // 2. Process specific root files
    for (const file of FILES_TO_CHECK) {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            await processFile(filePath);
        }
    }

    // console.log(`\n✨ Cleanup complete. Removed ${totalRemoved} samples labeled "work_style".`);

    function processFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            const originalLength = data.length;

            const cleanedData = data.filter(sample => sample.label !== 'work_style');

            if (cleanedData.length < originalLength) {
                const removed = originalLength - cleanedData.length;
                totalRemoved += removed;
                fs.writeFileSync(filePath, JSON.stringify(cleanedData, null, 2));
                // console.log(`   ✅ Cleaned ${path.basename(filePath)}: Removed ${removed} samples`);
            } else {
                // // console.log(`   (No changes) ${path.basename(filePath)}`);
            }
        } catch (e) {
            console.error(`   ❌ Error processing ${path.basename(filePath)}:`, e.message);
        }
    }
}

cleanFiles();
