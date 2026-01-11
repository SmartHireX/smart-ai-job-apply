#!/bin/bash

echo "Removing ES6 module syntax from all files..."

# Find all JS files in autofill, chatbot, common, shared
find autofill chatbot common shared -name '*.js' -type f | while read file; do
    echo "Processing: $file"
    
    # Remove import statements
    sed -i '' '/^import.*from/d' "$file"
    
    # Remove export statements but keep the declarations
    sed -i '' 's/^export class /class /g' "$file"
    sed -i '' 's/^export const /const /g' "$file"
    sed -i '' 's/^export function /function /g' "$file"
    sed -i '' 's/^export default //g' "$file"
    sed -i '' '/^export {/d' "$file"
    sed -i '' '/^export$/d' "$file"
done

echo "✅ Module syntax removed!"
