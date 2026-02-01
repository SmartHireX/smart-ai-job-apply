const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'train-dataset-augmented.json');

// Blacklist of non-English terms found in failure logs
const NON_ENGLISH_TERMS = [
    // German
    'jahre', 'erfahrung', 'gehalt', 'notfall', 'anschreiben', 'karriereziele',
    'warum', 'suche', 'berufserfahrung', 'kündigungsfrist', 'vorname', 'nachname',
    'postleitzahl', 'stadt', 'strasse', 'land', 'telefon',

    // French
    'lettre', 'salaire', 'prétention', 'poste', 'recherche', 'autorisé', 'parrainage',
    'nom', 'prénom', 'adresse', 'ville', 'pays', 'téléphone', 'courriel',

    // Spanish
    'fecha', 'nacimiento', 'graduación', 'autorizado', 'patrocinio', 'buscar',
    'nombre', 'apellido', 'dirección', 'ciudad', 'país', 'teléfono', 'correo',

    // Generic
    'carta_es', 'lettre_fr', 'fecha_es', 'recherche_fr', 'buscar_es'
];

function isEnglish(text) {
    if (!text) return true;
    const lower = text.toLowerCase();
    return !NON_ENGLISH_TERMS.some(term => lower.includes(term));
}

function cleanDataset() {
    // console.log('🧹 Filtering Dataset for English-Only compliance...');

    if (!fs.existsSync(DATA_PATH)) {
        console.error('❌ Dataset not found:', DATA_PATH);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const initialCount = data.length;

    const filteredData = data.filter(sample => {
        const f = sample.features;
        // Check core visible attributes for non-English terms
        const isClean = isEnglish(f.label) &&
            isEnglish(f.placeholder) &&
            isEnglish(f.name) &&
            isEnglish(f.id);

        return isClean;
    });

    const removedCount = initialCount - filteredData.length;
    // console.log(`✅ Removed ${removedCount} non-English samples.`);
    // console.log(`📉 Dataset reduced: ${initialCount} -> ${filteredData.length}`);

    fs.writeFileSync(DATA_PATH, JSON.stringify(filteredData, null, 2));
    // console.log('💾 Saved cleaned dataset.');
}

cleanDataset();
