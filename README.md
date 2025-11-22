# iLovePrivacyPDF

![iLovePrivacyPDF](https://github.com/Rovart/iLovePrivacyPDF/blob/fed4a587d6ad5c875dc9b6cbd6d325563edd4226/.github/iLovePDF.png)

A **privacy-first**, high-performance document processing application built with **Next.js** and **Rust**. Process your sensitive documents locally without sending data to cloud services. Extract text via AI-powered OCR, convert markdown to PDF, merge PDFs, and more—all on your own machine.

![Next.js](https://img.shields.io/badge/Next.js-16.0-black?style=flat-square&logo=next.js)
![Rust](https://img.shields.io/badge/Rust-1.70+-orange?style=flat-square&logo=rust)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

## ✨ Features

### 🎯 Document Processing Modes

| Mode | Input | Output | Use Case |
|------|-------|--------|----------|
| **OCR** | Images, PDFs | Markdown + PDF | Extract text from scanned documents with AI-powered OCR |
| **Markdown → PDF** | .md files | PDF | Convert markdown to beautifully formatted PDF |
| **Merge PDFs** | Multiple PDFs | Single PDF | Combine multiple PDF documents into one |
| **Split & Reorder PDF** | PDF | PDF | Select, reorder, and extract specific pages from PDFs |
| **Images ↔ PDF** | Images or PDF | PDF or Images | Convert images to PDF or extract images from PDF |
| **🔄 Convert Format** | Images | Images | Convert between image formats (JPEG, PNG, WebP, AVIF, TIFF) |
| **📜 History** | - | Previous outputs | Access and download all previously processed documents |

### 🎨 User Interface
- **Dark/Light Mode**: Full theme support with vintage aesthetic
- **Drag & Drop**: Intuitive file uploads with reordering support
- **Page Thumbnails**: Lazy-loaded PDF page previews with loading animations
- **Real-time Progress**: Live status updates during processing
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Paper & Ink Theme**: Distinctive vintage aesthetic avoiding generic templates
- **Organized Menu**: Features grouped into logical categories (OCR & Text, PDF Tools, Image Tools)
- **Privacy-Focused**: No external connections, all processing is local
- **📜 Document History**: Persistent history with quick access button

### � Privacy & Security
- **100% Local Processing**: All OCR and document processing happens on your machine
- **No Cloud Services**: Your documents never leave your computer
- **No Telemetry**: No tracking, no analytics, no data collection
- **Open Source**: Full transparency - audit the code yourself
- **Self-Hosted AI**: Run OCR models locally (NexaAI, Ollama)

### �🚀 Performance
- **Rust Backend**: 10-100x faster than Python
- **Async Processing**: Non-blocking operations
- **Memory Efficient**: Low memory footprint
- **On-Demand Servers**: Auto-start/stop OCR engines to save VRAM

## 📋 Prerequisites

### Required

- **Node.js** 18+ and npm
- **Rust** 1.70+ and cargo

### Optional (for PDF support)

- **Poppler Utils** (for PDF image extraction):
  ```bash
  # macOS
  brew install poppler
  
  # Ubuntu/Debian
  sudo apt-get install poppler-utils
  ```

### OCR Engines

The application uses **locally-hosted** OCR models (no cloud API calls):

> **⭐ Default**: The app is configured to use **Ollama** by default. Both NexaAI and Ollama run entirely offline with no cloud connections.

#### Ollama (Default)
```bash
# Install Ollama from https://ollama.ai
# Pull the deepseek-ocr model (downloads to your machine)
ollama pull deepseek-ocr

# Start server (local only, no internet required)
ollama serve
```

**Recommended model**: `deepseek-ocr`

#### NexaAI DeepSeek-OCR (Alternative)
```bash
# Install Nexa CLI
pipx install nexa

# Download and cache the OCR model locally
nexa infer NexaAI/DeepSeek-OCR-GGUF

# Start server (runs locally on your machine)
nexa serve --host 127.0.0.1:18181
```

**Note**: The first time you run `nexa infer`, it will download the DeepSeek-OCR model (~3-4GB) and cache it locally. Subsequent starts will be instant.

**Privacy Note**: Both engines run entirely on your machine. No data is sent to external servers.

## � Installation

### Automatic Installation (Recommended)

The project includes an `install.sh` script that automatically installs all dependencies:

```bash
git clone https://github.com/Rovart/iLovePrivacyPDF.git
cd iLovePrivacyPDF

chmod +x install.sh
./install.sh
```

This will:
1. ✅ Check/install Node.js 18+
2. ✅ Check/install Rust 1.70+
3. ✅ Check/install Poppler (optional, for PDF support)
4. ✅ Build Rust backend
5. ✅ Install Node.js dependencies
6. ✅ Create output directories
7. ✅ Detect OCR engines

**Supported platforms**: macOS (Homebrew), Ubuntu/Debian, Fedora, Windows (manual steps shown)

After installation, continue with Quick Start below.

## 🚀 Quick Start

### Option 1: Using Run Script (Recommended)

```bash
# After running install.sh, simply:
./run.sh
```

The script will:
1. ✅ Verify dependencies (Node.js, Rust)
2. 🔨 Build Rust backend if needed
3. 📦 Install Node.js dependencies if needed
4. 🏗️ Build Next.js production build
5. 🚀 Start server on http://localhost:3000
6. 🤖 Auto-detect and start OCR engines (if installed)

**Options:**
```bash
./run.sh --rebuild       # Force rebuild of Next.js
./stop.sh               # Stop all services
```

### Option 2: Manual Setup

```bash
# Build Rust backend
cd ocr-rust
cargo build --release
cd ..

# Install dependencies
cd ocr-app
npm install

# Start development server
npm run dev
```

Open: **http://localhost:3000**

### Option 3: Desktop App (Electron)

Run as a standalone desktop application:

```bash
# Quick start (development mode)
./run-electron.sh

# Or manually
cd ocr-app
npm run electron:dev
```

**Build standalone desktop app:**
```bash
# Interactive builder (choose platform)
./build-electron.sh

# Or build for specific platform
cd ocr-app
npm run electron:build:mac     # macOS (DMG + ZIP)
npm run electron:build:win     # Windows (NSIS + Portable)
npm run electron:build:linux   # Linux (AppImage + DEB)
```

**Packaged apps** will be in `ocr-app/dist/`

**Electron Features:**
- ✅ Standalone desktop application (no browser needed)
- ✅ Auto-starts Next.js server internally
- ✅ Includes Rust backend in package
- ✅ Works offline (all processing is local)
- ✅ Native menu bar and window controls
- ✅ Cross-platform (macOS, Windows, Linux)

## 📖 Usage

### Web Interface

1. **Select Processing Mode** from the categorized menu:
   - **📝 OCR & Text**: Extract Text (OCR), Markdown → PDF
   - **📄 PDF Tools**: Merge PDFs, Split & Reorder, Images ↔ PDF
   - **🖼️ Image Tools**: Convert Format
2. **Upload Files** via drag-and-drop or file picker
3. **Configure Options** (coordinates, prompts, quality, etc.)
4. **Click Process** and monitor real-time progress
5. **Download Results** when complete or access via History

### OCR Mode Features

- **Coordinates Mode**: Preserves document structure and text positioning
- **Plain Text Mode**: Simple top-to-bottom text extraction
- **Custom Prompts**: Add instructions for both NexaAI and Ollama models to improve OCR quality
- **Document/Photo Mode Toggle** (NexaAI): Switch between structured document OCR (with grounding tags) and free OCR for photos
- **Batch Processing**: Process multiple images/PDFs at once
- **Join Images** (Experimental): Combine multiple images into one before OCR

### Split & Reorder PDF Features

- **Visual Page Selection**: View PDF page thumbnails with lazy loading
- **Drag & Drop Reordering**: Rearrange pages in any order
- **Page Selection**: Click to select/deselect specific pages
- **Batch Operations**: Select All or Deselect All buttons
- **Live Preview**: See page thumbnails while making selections
- **Fast Thumbnails**: Optimized 50 DPI previews with loading animations

### History Mode Features

- **Server-Side Persistence**: History stored on server (survives app restarts)
- **Quick Access**: History button in top-right corner
- **Automatic Cleanup**: Removes history entries for deleted files
- **Quick Download**: Re-download any previously processed document
- **Delete Individual Items**: Remove unwanted entries from history
- **Clear All**: Bulk delete all history at once

### Image Conversion Features

- **Format Support**: Convert between JPEG, PNG, WebP, AVIF, and TIFF
- **Quality Control**: Adjustable quality slider (1-100%) for JPEG, WebP, and AVIF
- **Smart Compression**: PNG uses maximum compression, TIFF uses LZW compression
- **HEIC Input**: Supports HEIC/HEIF images as input (converts to other formats)
- **Batch Ready**: Convert one image at a time with instant processing

### Images ↔ PDF Features

- **Bidirectional Conversion**: 
  - Images → PDF: Combine multiple images into a single PDF
  - PDF → Images: Extract all pages as individual image files
- **Drag & Drop Reordering**: Arrange images in desired order before conversion
- **Format Options**: Choose output format for PDF → Images (JPEG, PNG, WebP, etc.)
- **Quality/DPI Control**: Adjustable settings for output quality

## 🏗️ Architecture

### Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Frontend** | Next.js + React | 16.0 / 19 |
| **Backend** | Rust | 1.70+ |
| **Desktop** | Electron | 39+ |
| **OCR API (Default)** | Ollama (vision models) | Latest |
| **OCR API (Alt)** | NexaAI DeepSeek-OCR | GGUF:BF16 |
| **Styling** | Tailwind CSS | 4.0 |
| **PDF Gen** | printpdf | 0.7 |
| **Image Processing** | Sharp | 0.34 |
| **Type Safety** | TypeScript | 5.0 |

### Project Structure

```
iLovePrivacyPDF/
├── run.sh                  # Quick start script (web)
├── run-electron.sh         # Quick start script (desktop)
├── build-electron.sh       # Build desktop app
├── stop.sh                 # Stop services
├── README.md               # This file
├── .gitignore              # Git ignore rules
│
├── ocr-rust/               # Rust CLI processor
│   ├── src/main.rs         # OCR & PDF processing
│   ├── Cargo.toml          # Rust dependencies
│   └── target/release/     # Compiled binary
│
└── ocr-app/                # Next.js web app
    ├── electron/           # Electron desktop app
    │   ├── main.js         # Electron main process
    │   └── preload.js      # Preload script
    ├── app/
    │   ├── api/            # API endpoints
    │   │   ├── process-stream/     # OCR streaming
    │   │   ├── convert-markdown/   # MD → PDF
    │   │   ├── merge-pdfs/         # PDF merge
    │   │   ├── split-pdf/          # PDF split & reorder
    │   │   ├── images-to-pdf/      # Images → PDF
    │   │   ├── pdf-to-images/      # PDF → Images
    │   │   ├── pdf-info/           # PDF page count
    │   │   ├── convert-image/      # Image format conversion
    │   │   └── history/            # Document history API
    │   ├── page.tsx        # Main UI
    │   └── layout.tsx      # Layout
    ├── lib/
    │   ├── paths.ts        # Path management utilities
    │   ├── rust-binary.ts  # Rust binary path resolution
    │   └── dependencies.ts # Dependency checking
    ├── public/
    │   ├── uploads/        # Uploaded files (gitignored)
    │   ├── outputs/        # Generated files & history (gitignored)
    │   └── temp_images/    # Temporary images (gitignored)
    ├── dist/               # Electron builds (gitignored)
    ├── package.json
    └── tsconfig.json
```

## 🔧 Configuration

### OCR API Endpoints

The app auto-detects models via CLI:
- **NexaAI**: `nexa list` → http://127.0.0.1:18181/v1/chat/completions
- **Ollama**: `ollama list` → http://127.0.0.1:11434/v1/chat/completions

### Custom Model Prompts

For Ollama models, the app automatically adds system instructions:
- "Return ONLY the OCR result. No thinking or explanations."
- "Fix grammar mistakes when confident."
- "Include coordinates" (if coordinates mode enabled)

### Server Port

```bash
# Development
npm run dev -- -p 3001

# Production
PORT=3001 npm run start
```

### GPU Acceleration

The `run.sh` script auto-detects GPUs and sets flags:

```bash
# Manual override
export NEXA_FLAGS="--ngl 32"
./run.sh

# For Ollama (auto-detected)
```

## 📡 API Endpoints

### POST `/api/process-stream`
Process images/PDFs with streaming progress.

**Request**: `multipart/form-data`
- `files`: Image or PDF files
- `ocrModel`: Model ID (e.g., "NexaAI/DeepSeek-OCR-GGUF:BF16")
- `useCoordinates`: "true" or "false"
- `customPrompt`: Optional custom instructions (works for both NexaAI and Ollama)
- `useGroundingMode`: "true" or "false" (NexaAI only, default: true)
- `joinImages`: "true" or "false" (experimental)

**Response**: Server-Sent Events (SSE)

### POST `/api/convert-markdown`
Convert markdown to PDF.

**Request**: `multipart/form-data`
- `files`: Markdown file(s)

**Response**: JSON with PDF URL

### POST `/api/merge-pdfs`
Merge multiple PDFs.

**Request**: `multipart/form-data`
- `files`: PDF files (order matters)

**Response**: JSON with PDF URL

### POST `/api/images-to-pdf`
Create PDF from images.

**Request**: `multipart/form-data`
- `files`: Image files (order matters)

**Response**: JSON with PDF URL

### POST `/api/pdf-to-images`
Extract images from PDF.

**Request**: `multipart/form-data`
- `files`: PDF file

**Response**: JSON with array of image URLs

### POST `/api/convert-image`
Convert image format.

**Request**: `multipart/form-data`
- `file`: Image file (supports HEIC/HEIF input)
- `format`: Target format (jpeg, png, webp, avif, tiff)
- `quality`: Quality percentage (1-100, for lossy formats)

**Response**: JSON with converted image URL

### GET/POST/DELETE/PUT `/api/history`
Manage document processing history.

**GET**: Load all history items (auto-verifies file existence)

**POST**: Add new item to history
- Body: `{ item: { mode, markdownUrl?, pdfUrl?, images? } }`

**DELETE**: Remove item by ID
- Query: `?id=<item-id>`

**PUT**: Clear all history

## 🎨 Design

The UI features a **paper & ink aesthetic** instead of generic "AI slop":

- **Typography**: Georgia serif headers, monospace technical text
- **Colors**: Cream paper (#e8e3d8), ink black (#1a1a1a), navy (#2d4f7c)
- **Animations**: Smooth transitions, organic motion
- **Dark Mode**: Deep black with golden accents

## 📊 Performance

### Rust vs Python Comparison

| Metric | Python | Rust | Improvement |
|--------|--------|------|-------------|
| Processing speed | ~2s/image | ~0.2s/image | **10x faster** |
| Memory usage | ~150MB | ~20MB | **7.5x less** |
| Startup time | ~1.5s | ~0.1s | **15x faster** |

### File Processing Times (M1 MacBook Pro)

- Small image (< 1MB): ~0.2s
- Large image (5-10MB): ~0.5s
- PDF (10 pages): ~2s
- Markdown → PDF: ~0.1s
- Merge PDFs (5 files): ~0.3s
- Images → PDF (10 images): ~1s

## 🐛 Troubleshooting

### "OCR API not responding"
```bash
# Check if server is running
curl http://127.0.0.1:18181/v1/models  # Nexa
curl http://127.0.0.1:11434/v1/models  # Ollama

# Start Nexa
nexa serve --host 127.0.0.1:18181

# Start Ollama
ollama serve
```

### "pdftoppm not found"
Install poppler:
```bash
brew install poppler        # macOS
sudo apt-get install poppler-utils  # Ubuntu/Debian
```

Alternatively, the app falls back to native Rust text extraction.

### "Rust binary not found"
```bash
cd ocr-rust
cargo build --release
```

### Port 3000 already in use
```bash
PORT=3001 npm run start
# Or
lsof -ti:3000 | xargs kill -9
```

### "Permission denied" on scripts
```bash
chmod +x run.sh stop.sh
```

## 🔄 Development

### Development Mode
```bash
cd ocr-app
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Rebuild Rust
```bash
cd ocr-rust
cargo build --release
```

### Linting
```bash
npm run lint
```

## �� Dependencies

### Frontend (`ocr-app/package.json`)
- `next`: ^16.0.3 - React framework
- `react`: ^19 - UI library
- `tailwindcss`: ^4 - Styling
- `lucide-react`: ^0.553 - Icons
- `@dnd-kit/*`: Drag & drop
- `sharp`: ^0.34 - Image processing
- `pdf-lib`: ^1.17 - PDF manipulation

### Backend (`ocr-rust/Cargo.toml`)
- `tokio`: ^1.42 - Async runtime
- `reqwest`: ^0.12 - HTTP client
- `serde`: ^1.0 - Serialization
- `image`: ^0.25 - Image processing
- `printpdf`: ^0.7 - PDF generation
- `clap`: ^4.5 - CLI parsing
- `regex`: ^1.11 - Text patterns
- `base64`: ^0.22 - Encoding

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Code Style
- **TypeScript**: Follow Next.js conventions
- **Rust**: Run `cargo fmt` before committing
- **Commits**: Use conventional commit format

## 📄 License

This project is licensed under a **Custom Non-Commercial License**.

### Key Terms:
- ✅ Free to use, modify, and distribute for **non-commercial purposes**
- ✅ Attribution required
- ✅ Patent protection included
- ❌ Commercial use restricted (only authorized for the copyright holder)
- ❌ No warranty or liability

See the [LICENSE](LICENSE) file for full details.

### Commercial Use
For commercial licensing or to request an exception, please contact Roberto.

### What This Means:
- **Personal projects**: ✅ Allowed
- **Education & research**: ✅ Allowed
- **Open-source sharing**: ✅ Allowed
- **For-profit use**: ❌ Not allowed without permission
- **SaaS offerings**: ❌ Not allowed without permission
- **Selling derivatives**: ❌ Not allowed without permission

## 🙏 Acknowledgments

- **NexaAI** - DeepSeek-OCR model
- **Ollama** - Local LLM support
- **Vercel** - Next.js framework
- **Rust Community** - Excellent libraries and tooling
- **Poppler** - PDF utilities
- **Sharp** - Image processing

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/Rovart/iLovePrivacyPDF/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Rovart/iLovePrivacyPDF/discussions)

---

**Built with ❤️ for Privacy | 100% Local Processing | No Cloud Required**

*Last updated: November 16, 2025*
