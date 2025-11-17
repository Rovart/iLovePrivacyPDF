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
    
    // In production/packaged app, use the built Next.js server
    // In development, use npm run start
    const isDev = !app.isPackaged;
    
    if (isDev) {
      console.log('Development mode: using npm start');
      const nextPath = path.join(__dirname, '..');
      
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
    } else {
      console.log('Production mode: starting embedded Next.js server');
      
      // In packaged app:
      // - app.asar is in Contents/Resources/app.asar
      // - extraFiles places content in Contents/app/ (not Resources!)
      // - extraResources places content in Contents/Resources/
      
      // Get Contents directory by going up from Resources
      const contentsPath = path.dirname(process.resourcesPath);
      
      // Try multiple possible locations for the Next.js server
      const possibleServerPaths = [
        path.join(contentsPath, 'app', '.next', 'standalone', 'server.js'), // Contents/app/... (extraFiles)
        path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js'), // Contents/Resources/app/...
        path.join(app.getAppPath(), '.next', 'standalone', 'server.js'), // app.asar/...
      ];
      
      let serverPath = null;
      for (const possiblePath of possibleServerPaths) {
        console.log('Checking server path:', possiblePath);
        if (fs.existsSync(possiblePath)) {
          serverPath = possiblePath;
          console.log('✓ Found Next.js server at:', serverPath);
          break;
        }
      }
      
      if (serverPath) {
        console.log('Starting standalone Next.js server');
        
        const serverDir = path.dirname(serverPath);
        
        // Use process.execPath (Electron binary) which has Node.js built-in
        // instead of 'node' which may not be in PATH in packaged app
        nextServer = spawn(process.execPath, [serverPath], {
          cwd: serverDir,
          env: {
            ...process.env,
            PORT: PORT.toString(),
            NODE_ENV: 'production',
            ELECTRON_RUN_AS_NODE: '1' // Run Electron as Node.js
          },
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
      } else {
        const errorMessage = `Next.js server not found at any of the expected locations:\n${possibleServerPaths.join('\n')}`;
        console.error(errorMessage);
        
        dialog.showErrorBox(
          'Failed to start the application',
          `${errorMessage}\n\nPlease check that:\n1. Next.js is built (npm run build)\n2. Port ${PORT} is available`
        );
        
        reject(new Error(errorMessage));
      }
    }
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

app.on('activate', async () => {
  // On macOS re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    // Ensure app is ready before creating window
    if (app.isReady()) {
      // Make sure server is running
      try {
        await waitForServer(PORT);
        createWindow();
      } catch (error) {
        console.error('Server not available on activate:', error);
      }
    }
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
