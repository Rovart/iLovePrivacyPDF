const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;
let nextServer;
const PORT = 3000;

// Get path to Rust binary (handles both development and packaged app)
function getRustBinaryPath() {
  // Check if we're in a packaged app
  if (app.isPackaged) {
    const resourcesPath = process.resourcesPath;
    
    // Try different locations based on platform
    const possiblePaths = [
      path.join(resourcesPath, 'iloveprivacypdf'), // Linux/macOS
      path.join(resourcesPath, 'iloveprivacypdf.exe'), // Windows
      path.join(resourcesPath, '..', 'MacOS', 'iloveprivacypdf'), // macOS app bundle alternative
    ];
    
    for (const binaryPath of possiblePaths) {
      if (fs.existsSync(binaryPath)) {
        return binaryPath;
      }
    }
  }
  
  // Development mode
  return path.join(__dirname, '..', '..', 'ocr-rust', 'target', 'release', 'iloveprivacypdf');
}

const rustBinaryPath = getRustBinaryPath();

function checkRustBinary() {
  if (!fs.existsSync(rustBinaryPath)) {
    dialog.showErrorBox(
      'Missing Rust Binary',
      `Rust backend not found at: ${rustBinaryPath}\n\nPlease build the Rust backend first:\ncd ocr-rust && cargo build --release`
    );
    app.quit();
    return false;
  }
  return true;
}

function waitForServer(port, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const checkServer = () => {
      attempts++;
      
      http.get(`http://localhost:${port}`, (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) {
          console.log(`✓ Next.js server is ready on port ${port}`);
          resolve();
        } else {
          retryCheck();
        }
      }).on('error', () => {
        retryCheck();
      });
    };
    
    const retryCheck = () => {
      if (attempts < maxAttempts) {
        console.log(`Waiting for server... (${attempts}/${maxAttempts})`);
        setTimeout(checkServer, 1000);
      } else {
        reject(new Error('Server failed to start within timeout'));
      }
    };
    
    checkServer();
  });
}

async function startNextServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting Next.js server...');
    
    const nextPath = path.join(__dirname, '..');
    
    // Start Next.js in production mode
    nextServer = spawn('npm', ['run', 'start'], {
      cwd: nextPath,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    nextServer.stdout.on('data', (data) => {
      console.log(`Next.js: ${data.toString().trim()}`);
    });

    nextServer.stderr.on('data', (data) => {
      console.error(`Next.js error: ${data.toString().trim()}`);
    });

    nextServer.on('error', (error) => {
      console.error('Failed to start Next.js:', error);
      reject(error);
    });

    // Wait for server to be ready
    waitForServer(PORT)
      .then(resolve)
      .catch(reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    title: 'iLovePrivacyPDF',
    backgroundColor: '#1a1a1a',
    show: false // Don't show until ready
  });

  // Load the Next.js app
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('✓ Window loaded and ready');
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║      iLovePrivacyPDF Desktop App      ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  
  // Check Rust binary first
  if (!checkRustBinary()) {
    return;
  }
  
  try {
    // Start Next.js server
    await startNextServer();
    
    // Create Electron window
    createWindow();
    
    console.log('');
    console.log('✓ Application ready!');
    console.log('');
  } catch (error) {
    console.error('Failed to start application:', error);
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start the application:\n${error.message}\n\nPlease check that:\n1. Next.js is built (npm run build)\n2. Port ${PORT} is available`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Quit when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  console.log('Shutting down Next.js server...');
  
  // Kill Next.js server
  if (nextServer) {
    nextServer.kill('SIGTERM');
    
    // Force kill after 5 seconds if not stopped
    setTimeout(() => {
      if (nextServer && !nextServer.killed) {
        nextServer.kill('SIGKILL');
      }
    }, 5000);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Application Error', error.message);
});
