#!/bin/bash

# iLovePrivacyPDF - Installation Script
# This script installs all required dependencies for privacy-first local document processing
# (Node.js, Rust, Poppler) and prepares the project for first run.

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  $1${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${CYAN}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if grep -qi ubuntu /etc/os-release; then
            echo "ubuntu"
        elif grep -qi debian /etc/os-release; then
            echo "debian"
        elif grep -qi fedora /etc/os-release; then
            echo "fedora"
        else
            echo "linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        echo "windows"
    else
        echo "unknown"
    fi
}

check_command() {
    command -v "$1" &> /dev/null
}

# ============================================================================
# Main Installation
# ============================================================================

print_header "iLovePrivacyPDF - Installation"

OS=$(detect_os)
print_step "Detected OS: $OS"

# ============================================================================
# 1. Check and Install Node.js
# ============================================================================

print_header "Step 1: Node.js"

if check_command node; then
    NODE_VERSION=$(node --version)
    print_success "Node.js already installed ($NODE_VERSION)"
else
    print_warning "Node.js not found. Installing..."
    
    case $OS in
        macos)
            if check_command brew; then
                print_step "Using Homebrew to install Node.js..."
                brew install node
            else
                print_error "Homebrew not found. Please install Node.js manually from https://nodejs.org/"
                exit 1
            fi
            ;;
        ubuntu|debian)
            print_step "Using apt to install Node.js..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        fedora)
            print_step "Using dnf to install Node.js..."
            sudo dnf install -y nodejs
            ;;
        windows)
            print_error "Please install Node.js manually from https://nodejs.org/"
            exit 1
            ;;
        *)
            print_error "Unsupported OS. Please install Node.js manually from https://nodejs.org/"
            exit 1
            ;;
    esac
    
    NODE_VERSION=$(node --version)
    print_success "Node.js installed ($NODE_VERSION)"
fi

if check_command npm; then
    NPM_VERSION=$(npm --version)
    print_success "npm already installed ($NPM_VERSION)"
fi

# ============================================================================
# 2. Check and Install Rust
# ============================================================================

print_header "Step 2: Rust"

if check_command rustc; then
    RUST_VERSION=$(rustc --version)
    print_success "Rust already installed ($RUST_VERSION)"
else
    print_warning "Rust not found. Installing..."
    
    case $OS in
        windows)
            print_error "Please install Rust manually from https://rustup.rs/"
            exit 1
            ;;
        *)
            print_step "Downloading and installing Rust..."
            curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
            source "$HOME/.cargo/env"
            ;;
    esac
    
    RUST_VERSION=$(rustc --version)
    print_success "Rust installed ($RUST_VERSION)"
fi

if check_command cargo; then
    CARGO_VERSION=$(cargo --version)
    print_success "Cargo already installed ($CARGO_VERSION)"
fi

# ============================================================================
# 3. Check and Install Poppler (Optional but Recommended)
# ============================================================================

print_header "Step 3: Poppler Utils (Optional)"

if check_command pdftoppm; then
    print_success "pdftoppm already installed (Poppler)"
else
    print_warning "pdftoppm not found. PDF extraction will use native fallback (text-only)."
    print_step "Installing Poppler for better PDF support..."
    
    case $OS in
        macos)
            if check_command brew; then
                print_step "Using Homebrew to install Poppler..."
                brew install poppler
                print_success "Poppler installed"
            else
                print_warning "Homebrew not found. Please install Poppler manually:"
                print_warning "  brew install poppler"
            fi
            ;;
        ubuntu|debian)
            print_step "Using apt to install Poppler..."
            sudo apt-get update
            sudo apt-get install -y poppler-utils
            print_success "Poppler installed"
            ;;
        fedora)
            print_step "Using dnf to install Poppler..."
            sudo dnf install -y poppler-utils
            print_success "Poppler installed"
            ;;
        windows)
            print_warning "Please install Poppler manually from:"
            print_warning "  https://github.com/oschwartz10612/poppler-windows/releases/"
            ;;
        *)
            print_warning "Please install Poppler (poppler-utils) for your system"
            ;;
    esac
fi

# ============================================================================
# 4. Build Rust Backend
# ============================================================================

print_header "Step 4: Building Rust Backend"

if [ -f "ocr-rust/target/release/ocr_processor" ]; then
    print_success "Rust binary already built"
else
    print_step "Building OCR processor..."
    cd ocr-rust
    cargo build --release
    cd ..
    print_success "Rust binary built successfully"
fi

# ============================================================================
# 5. Install Node.js Dependencies
# ============================================================================

print_header "Step 5: Installing Node.js Dependencies"

cd ocr-app

if [ -d "node_modules" ]; then
    print_success "Node.js dependencies already installed"
else
    print_step "Running npm install..."
    npm install
    print_success "Node.js dependencies installed"
fi

cd ..

# ============================================================================
# 6. OCR Engines (Optional)
# ============================================================================

print_header "Step 6: OCR Engines (Optional)"

print_step "Checking for NexaAI..."
if check_command nexa; then
    print_success "NexaAI CLI is installed"
    print_step "To start NexaAI server, run: nexa serve --host 127.0.0.1:18181"
else
    print_warning "NexaAI not installed"
    print_step "To install NexaAI, run: pipx install nexa"
fi

print_step "Checking for Ollama..."
if check_command ollama; then
    print_success "Ollama is installed"
    print_step "To start Ollama, run: ollama serve"
    print_step "To pull a vision model, run: ollama pull gemma3:12b"
else
    print_warning "Ollama not installed"
    print_step "To install Ollama, visit: https://ollama.ai"
fi

# ============================================================================
# 7. Project Structure Verification
# ============================================================================

print_header "Step 7: Verifying Project Structure"

# Create necessary directories if they don't exist
print_step "Creating output directories..."
mkdir -p ocr-app/public/uploads
mkdir -p ocr-app/public/outputs
mkdir -p ocr-app/public/temp_images
mkdir -p ocr-rust/temp_images

# Add .gitkeep files to preserve empty directories
touch ocr-app/public/uploads/.gitkeep
touch ocr-app/public/outputs/.gitkeep
touch ocr-app/public/temp_images/.gitkeep

print_success "Project structure ready"

# ============================================================================
# 8. Summary and Next Steps
# ============================================================================

print_header "Installation Complete!"

echo -e "${GREEN}All required dependencies have been installed.${NC}"
echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo ""
echo -e "${YELLOW}1. Start the OCR engines (optional but recommended):${NC}"
echo -e "   ${BLUE}# For NexaAI:${NC}"
echo -e "   ${BLUE}nexa serve --host 127.0.0.1:18181${NC}"
echo -e "   ${BLUE}# For Ollama:${NC}"
echo -e "   ${BLUE}ollama serve${NC}"
echo ""
echo -e "${YELLOW}2. Start the application:${NC}"
echo -e "   ${BLUE}./run.sh${NC}"
echo ""
echo -e "${YELLOW}3. Open your browser:${NC}"
echo -e "   ${BLUE}http://localhost:3000${NC}"
echo ""
echo -e "${GREEN}For more information, see README.md${NC}"
echo ""
