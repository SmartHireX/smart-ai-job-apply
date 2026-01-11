#!/bin/bash

echo "Fixing constant references to use window.NovaConstants..."

# Fix files that reference constants
find autofill chatbot common shared -name '*.js' -type f | while read file; do
    # Skip constants.js itself
    if [[ "$file" == *"constants.js"* ]]; then
        continue
    fi
    
    # Replace bare constant references with window.NovaConstants
    sed -i '' 's/\bCONFIDENCE\./window.NovaConstants.CONFIDENCE./g' "$file"
    sed -i '' 's/\bWORK_LABELS\b/window.NovaConstants.WORK_LABELS/g' "$file"
    sed -i '' 's/\bEDUCATION_LABELS\b/window.NovaConstants.EDUCATION_LABELS/g' "$file"
    sed -i '' 's/\bHISTORY_LABELS\b/window.NovaConstants.HISTORY_LABELS/g' "$file"
    sed -i '' 's/\bHISTORY_LABELS_FOR_SAVE\b/window.NovaConstants.HISTORY_LABELS_FOR_SAVE/g' "$file"
    sed -i '' 's/\bSAFE_OVERRIDE_PATTERN\b/window.NovaConstants.SAFE_OVERRIDE_PATTERN/g' "$file"
    sed -i '' 's/\bTEXT_FIELD_TYPES\b/window.NovaConstants.TEXT_FIELD_TYPES/g' "$file"
    sed -i '' 's/\bCACHE_LIMITS\b/window.NovaConstants.CACHE_LIMITS/g' "$file"
done

echo "✅ Constants fixed!"
