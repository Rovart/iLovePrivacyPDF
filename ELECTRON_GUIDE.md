# iLovePrivacyPDF - Electron Desktop App Guide

## 🖥️ Quick Start

### Development Mode (Hot Reload)

```bash
# From project root
./run-electron.sh

# Or from ocr-app directory
cd ocr-app
npm run electron:dev
```

This will:
1. Start Next.js development server on http://localhost:3000
2. Wait for server to be ready
3. Launch Electron window automatically
4. Enable hot reload (changes reflect automatically)

### Production Mode (Test Build)

```bash
cd ocr-app
npm run build      # Build Next.js
npm run electron   # Launch Electron with production build
```

## 📦 Building Standalone Apps

### Interactive Build (Recommended)

```bash
./build-electron.sh
```

Choose your platform:
- 1: macOS (DMG + ZIP)
- 2: Windows (NSIS + Portable)
- 3: Linux (AppImage + DEB)
- 4: All platforms

### Manual Build Commands

```bash
cd ocr-app

# macOS
npm run electron:build:mac

# Windows
npm run electron:build:win

# Linux
npm run electron:build:linux

# All platforms
npm run electron:build
```

### Output Location

Packaged apps will be in: `ocr-app/dist/`

**macOS:**
- `iLovePrivacyPDF-1.0.0.dmg` - Installer
- `iLovePrivacyPDF-1.0.0-mac.zip` - Portable

**Windows:**
- `iLovePrivacyPDF Setup 1.0.0.exe` - Installer (NSIS)
- `iLovePrivacyPDF 1.0.0.exe` - Portable

**Linux:**
- `iLovePrivacyPDF-1.0.0.AppImage` - Universal (most compatible)
- `iloveprivacypdf_1.0.0_amd64.deb` - Debian/Ubuntu

## 🔧 Requirements

### Prerequisites

All same as web version, plus:
- **Built Rust backend**: `cd ocr-rust && cargo build --release`
- **Built Next.js**: `cd ocr-app && npm run build`

### What Gets Packaged

The Electron build includes:
- ✅ Next.js production build (`.next/` folder)
- ✅ Rust binary (`ocr-rust/target/release/iloveprivacypdf`)
- ✅ Node.js runtime (embedded by Electron)
- ✅ All dependencies
- ✅ Static assets (`public/` folder)

### What Users Need to Install

**Nothing!** The desktop app is completely standalone. Users just:
1. Download the installer/package for their OS
2. Install/run the app
3. Start processing documents

**Optional (for OCR):**
- **NexaAI**: `pipx install nexa` + download model
- **Ollama**: Install from https://ollama.ai + pull model

*Note: Without OCR engines, users can still use PDF merge, markdown conversion, and image conversion features.*

## 🛠️ Troubleshooting

### Electron won't start

```bash
# Check if Rust binary exists
ls -la ocr-rust/target/release/iloveprivacypdf

# If missing, build it
cd ocr-rust && cargo build --release
```

### Port 3000 already in use

```bash
# Kill existing Next.js process
pkill -f "next start"

# Or change port in electron/main.js (line 8):
const PORT = 3001;
```

### Build fails

```bash
# Clean and rebuild
cd ocr-app
rm -rf .next dist node_modules
npm install
npm run build
npm run electron:build
```

### App shows blank window

```bash
# Check Next.js build completed
ls -la ocr-app/.next

# If missing, rebuild
cd ocr-app && npm run build
```

### macOS: "App is damaged" error

```bash
# Remove quarantine attribute
xattr -cr /Applications/iLovePrivacyPDF.app
```

### Linux: AppImage won't run

```bash
# Make it executable
chmod +x iLovePrivacyPDF-1.0.0.AppImage

# Run it
./iLovePrivacyPDF-1.0.0.AppImage
```

## 📝 Configuration

### Custom App Icon

Replace `ocr-app/public/icon.png` with your own icon (512x512 recommended).

### App Metadata

Edit `ocr-app/package.json`:

```json
{
  "name": "iloveprivacypdf",
  "version": "1.0.0",
  "description": "Your description",
  "build": {
    "appId": "com.yourcompany.app",
    "productName": "Your App Name"
  }
}
```

### Window Size

Edit `ocr-app/electron/main.js`:

```javascript
mainWindow = new BrowserWindow({
  width: 1400,    // Change width
  height: 900,    // Change height
  minWidth: 800,  // Minimum width
  minHeight: 600  // Minimum height
});
```

## 🚀 Distribution

### Signing (macOS/Windows)

For production distribution, you should sign your apps:

**macOS:**
```bash
# Requires Apple Developer account
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=password
npm run electron:build:mac
```

**Windows:**
```bash
# Requires code signing certificate
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=password
npm run electron:build:win
```

### Auto-Updates (Optional)

To add auto-update functionality, integrate `electron-updater`:
- https://www.electron.build/auto-update.html

## 🎯 Development Tips

### Debug Mode

Open DevTools by uncommenting in `electron/main.js`:

```javascript
if (process.env.NODE_ENV === 'development') {
  mainWindow.webContents.openDevTools();
}
```

Or set environment variable:
```bash
export NODE_ENV=development
npm run electron
```

### Hot Reload

Use `npm run electron:dev` for automatic reload when you change code.

### Multiple Windows

To open additional windows, modify `electron/main.js`:

```javascript
function createSecondaryWindow() {
  const secondWindow = new BrowserWindow({
    width: 800,
    height: 600,
    parent: mainWindow // Make it child of main
  });
  secondWindow.loadURL(`http://localhost:${PORT}/path`);
}
```

## 📚 Resources

- **Electron Docs**: https://www.electronjs.org/docs
- **electron-builder**: https://www.electron.build/
- **Next.js with Electron**: https://nextjs.org/docs/pages/building-your-application/configuring/custom-server

## ✅ Checklist Before Building

- [ ] Rust backend built: `cargo build --release`
- [ ] Next.js built: `npm run build`
- [ ] All dependencies installed: `npm install`
- [ ] Test in development: `npm run electron:dev`
- [ ] Test production build: `npm run electron`
- [ ] Icon set (optional): `ocr-app/public/icon.png`
- [ ] App metadata updated: `package.json`
- [ ] Choose target platform(s)
- [ ] Run build script: `./build-electron.sh`

## 🎉 Success!

Your standalone desktop app is ready! Users can now:
- Download and install from the `dist/` folder
- Run without any manual setup
- Process documents completely offline
- Enjoy native OS integration
