
#!/bin/bash

# Get the script directory (root of project)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure stop.sh is executed on exit using absolute path
trap "$SCRIPT_DIR/stop.sh" EXIT

# iLovePrivacyPDF - Run Script
# Privacy-first document processing - runs locally on your machine

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     iLovePrivacyPDF - Run Script      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}✗ Rust not found!${NC}"
    echo -e "${YELLOW}Please install Rust: https://rustup.rs/${NC}"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found!${NC}"
    echo -e "${YELLOW}Please install Node.js: https://nodejs.org/${NC}"
    exit 1
fi

# Check if pdftoppm is installed
if ! command -v pdftoppm &> /dev/null; then
    echo -e "${YELLOW}⚠ Warning: pdftoppm not found!${NC}"
    echo -e "${YELLOW}PDF extraction will not work without poppler-utils.${NC}"
    echo -e "${YELLOW}Install with:${NC}"
    echo -e "${YELLOW}  macOS: brew install poppler${NC}"
    echo -e "${YELLOW}  Ubuntu/Debian: sudo apt-get install poppler-utils${NC}"
    echo ""
    # Optionally attempt to install poppler if environment variable AUTO_INSTALL_POPPLER is set
    if [ "${AUTO_INSTALL_POPPLER}" = "true" ]; then
        echo -e "${BLUE}AUTO_INSTALL_POPPLER is enabled - attempting to install poppler...${NC}"
        if command -v brew &> /dev/null; then
            brew install poppler || echo -e "${YELLOW}brew install failed; please install manually.${NC}"
        elif command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y poppler-utils || echo -e "${YELLOW}apt-get install failed; please install manually.${NC}"
        elif command -v choco &> /dev/null; then
            choco install poppler || echo -e "${YELLOW}choco install failed; please install manually.${NC}"
        else
            echo -e "${YELLOW}No known package manager found to automatically install poppler.${NC}"
        fi
        # Re-check if pdftoppm is installed
        if command -v pdftoppm &> /dev/null; then
            echo -e "${GREEN}✓ pdftoppm is now available${NC}"
        else
            echo -e "${YELLOW}⚠ pdftoppm still not found; the app will use native fallback extraction where possible.${NC}"
        fi
    fi
fi

# Build Rust backend if needed
echo -e "${BLUE}[1/3] Checking Rust backend...${NC}"
if [ ! -f "ocr-rust/target/release/iloveprivacypdf" ]; then
    echo -e "${YELLOW}Building Rust OCR processor...${NC}"
    cd ocr-rust
    cargo build --release
    cd ..
    echo -e "${GREEN}✓ Rust binary built successfully${NC}"
else
    echo -e "${GREEN}✓ Rust binary already exists${NC}"
fi

# Install Node.js dependencies if needed
echo -e "${BLUE}[2/3] Checking Node.js dependencies...${NC}"
if [ ! -d "ocr-app/node_modules" ]; then
    echo -e "${YELLOW}Installing Node.js dependencies...${NC}"
    cd ocr-app
    npm install
    cd ..
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

# Start Next.js development server
echo -e "${BLUE}[3/3] Starting Next.js development server...${NC}"
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Server Starting...             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}🚀 Application will be available at:${NC}"
echo -e "${GREEN}   http://localhost:3000${NC}"
echo ""
echo -e "${YELLOW}📝 OCR Engines (on-demand - all local processing):${NC}"
echo ""

# Check for Nexa CLI (don't start, just detect)
if command -v nexa &> /dev/null; then
    if curl -s --max-time 1 http://127.0.0.1:18181/v1/models > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Nexa server already running (local processing)${NC}"
    else
        echo -e "${BLUE}  • Nexa CLI available (starts locally on-demand)${NC}"
    fi
else
    echo -e "${YELLOW}  • Nexa CLI not found. Install with: pipx install nexa${NC}"
fi

# Check for Ollama (don't start, just detect)
if command -v ollama &> /dev/null; then
    if curl -s --max-time 1 http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ollama server already running (local processing)${NC}"
    else
        echo -e "${BLUE}  • Ollama CLI available (starts locally on-demand)${NC}"
    fi
else
    echo -e "${YELLOW}  • Ollama not found. Install from: https://ollama.ai${NC}"
fi

echo ""
echo -e "${BLUE}Press Ctrl+C to stop the server${NC}"
echo ""

cd ocr-app

# Always build if --rebuild flag is passed, or if .next does not exist
if [ "$1" = "--rebuild" ] || [ ! -d ".next" ]; then
    echo -e "${BLUE}Building Next.js application for production...${NC}"
    npm run build
    echo -e "${GREEN}✓ Production build complete${NC}"
    echo ""
fi

# Start production server
echo -e "${GREEN}🚀 Starting production server...${NC}"
npm run start
