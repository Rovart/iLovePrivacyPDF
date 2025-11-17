#!/bin/bash

# iLovePrivacyPDF - Build Electron Desktop App
# This script builds both the Rust backend and Electron app

set -e  # Exit on error

echo "╔════════════════════════════════════════╗"
echo "║  iLovePrivacyPDF - Electron Builder   ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -d "ocr-rust" ] || [ ! -d "ocr-app" ]; then
    echo "❌ Error: This script must be run from the iLovePrivacyPDF root directory"
    exit 1
fi

# Step 1: Build Rust backend
echo "[1/3] Building Rust backend..."
cd ocr-rust
if ! cargo build --release; then
    echo "❌ Failed to build Rust backend"
    exit 1
fi
echo "✓ Rust backend built successfully"
cd ..

# Step 2: Build Next.js app
echo ""
echo "[2/3] Building Next.js application..."
cd ocr-app
if ! npm run build; then
    echo "❌ Failed to build Next.js app"
    exit 1
fi
echo "✓ Next.js app built successfully"

# Step 3: Build Electron app
echo ""
echo "[3/3] Building Electron desktop application..."
echo ""
echo "Choose your platform:"
echo "  1) macOS (DMG + ZIP)"
echo "  2) Windows (NSIS + Portable)"
echo "  3) Linux (AppImage + DEB)"
echo "  4) All platforms"
echo ""
read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo "Building for macOS..."
        npm run electron:build:mac
        ;;
    2)
        echo "Building for Windows..."
        npm run electron:build:win
        ;;
    3)
        echo "Building for Linux..."
        npm run electron:build:linux
        ;;
    4)
        echo "Building for all platforms..."
        npm run electron:build
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "╔════════════════════════════════════════╗"
echo "║          Build Complete! 🎉            ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "📦 Your packaged app is in: ocr-app/dist/"
echo ""

# Step 4: Clean up build artifacts
echo "[4/4] Cleaning up build artifacts..."
echo ""

# Clean Next.js build artifacts
echo "  • Removing .next/ directory..."
rm -rf .next/

# Clean icon generation artifacts
echo "  • Removing iconset directory..."
rm -rf public/icon.iconset/

# Clean temporary files
echo "  • Removing temporary files..."
rm -f ../logo_processed.png

# Clean node build artifacts
echo "  • Removing node build cache..."
rm -rf node_modules/.cache/

# Go back to root
cd ..

# Clean Rust build artifacts (keep only the release binary)
echo "  • Cleaning Rust build artifacts..."
cd ocr-rust
if [ -d "target/release" ]; then
    # Keep only the binary, remove everything else
    find target/release -mindepth 1 -maxdepth 1 ! -name "iloveprivacypdf" -exec rm -rf {} +
fi
# Remove debug builds entirely
rm -rf target/debug/
cd ..

echo ""
echo "✓ All build artifacts cleaned!"
echo ""
echo "Final output:"
echo "  📦 Packaged app: ocr-app/dist/"
echo "  🦀 Rust binary: ocr-rust/target/release/iloveprivacypdf"
echo ""
echo "To test the app before packaging, run:"
echo "  npm run electron"
echo ""
