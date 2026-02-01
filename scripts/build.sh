#!/bin/bash

# Nova Apply - Production Build Script
# This script packages the extension into a ZIP file for Chrome Web Store submission.
# It only includes the necessary files and excludes development assets.

EXTENSION_NAME="nova-apply-v1.0"
ZIP_FILE="${EXTENSION_NAME}.zip"
BUILD_DIR="build_temp"

echo "🚀 Starting build for Nova Apply..."

# Clean up previous builds
rm -rf "$BUILD_DIR"
rm -f "$ZIP_FILE"

# Create build directory
mkdir -p "$BUILD_DIR"

# List of files/folders to include (Whitelist)
COMPONENTS=(
    "manifest.json"
    "icons"
    "popup"
    "options"
    "background"
    "autofill"
    "shared"
    "common"
)

echo "📦 Copying components..."
for item in "${COMPONENTS[@]}"; do
    if [ -e "$item" ]; then
        cp -R "$item" "$BUILD_DIR/"
    else
        echo "⚠️  Warning: $item not found, skipping."
    fi
done

# Perform additional cleanup inside the build directory
echo "🧹 Cleaning up internal build files..."
find "$BUILD_DIR" -name "*.DS_Store" -type f -delete
find "$BUILD_DIR" -name "README.md" -type f -delete
find "$BUILD_DIR" -name "*.map" -type f -delete # Remove source maps if any

# Create the ZIP file
echo "🗜️  Zipping extension..."
cd "$BUILD_DIR"
zip -r "../$ZIP_FILE" . -x "*.DS_Store"
cd ..

# Clean up
rm -rf "$BUILD_DIR"

echo "✅ Build complete! Final package: $ZIP_FILE"
echo "✨ Ready for submission."
