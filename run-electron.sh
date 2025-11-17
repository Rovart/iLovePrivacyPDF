#!/bin/bash

# iLovePrivacyPDF - Run Electron App (Development Mode)
# This script runs the Electron app in development mode with hot reload

set -e

echo "╔════════════════════════════════════════╗"
echo "║   iLovePrivacyPDF - Electron Dev Mode  ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -d "ocr-rust" ] || [ ! -d "ocr-app" ]; then
    echo "❌ Error: This script must be run from the iLovePrivacyPDF root directory"
    exit 1
fi

# Check Rust binary
if [ ! -f "ocr-rust/target/release/iloveprivacypdf" ]; then
    echo "⚠️  Rust binary not found. Building..."
    cd ocr-rust
    cargo build --release
    cd ..
    echo "✓ Rust backend built"
fi

# Start Electron in development mode
echo "🚀 Starting Electron app in development mode..."
echo ""
echo "This will:"
echo "  1. Start Next.js dev server (http://localhost:3000)"
echo "  2. Launch Electron window when ready"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd ocr-app
npm run electron:dev
