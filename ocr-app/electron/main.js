const { app, BrowserWindow, dialog } = require('electron');
const { spawn, fork } = require('child_process');
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

function waitForServer(port, maxAttempts = 60) {
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
      let serverDir = null;
      for (const possiblePath of possibleServerPaths) {
        console.log('Checking server path:', possiblePath);
        if (fs.existsSync(possiblePath)) {
          serverPath = possiblePath;
          serverDir = path.dirname(possiblePath);
          console.log('✓ Found Next.js server at:', serverPath);
          console.log('✓ Server directory:', serverDir);
          break;
        }
      }
      
      if (serverPath && serverDir) {
        console.log('Starting Next.js server directly in Electron process...');
        
        try {
          // Set environment variables for Next.js
          process.env.PORT = PORT.toString();
          process.env.NODE_ENV = 'production';
          process.env.HOSTNAME = 'localhost';
          
          // Add module search paths for node_modules
          // Check both the standalone location and app.asar.unpacked
          const modulePaths = [
            path.join(serverDir, 'node_modules'),
            path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
            path.join(app.getAppPath(), 'node_modules')
          ];
          
          // Add all possible module paths to NODE_PATH
          modulePaths.forEach(modPath => {
            if (fs.existsSync(modPath)) {
              console.log('Adding module path:', modPath);
              if (!module.paths.includes(modPath)) {
                module.paths.unshift(modPath);
              }
            }
          });
          
          // Change to server directory so Next.js can find its files
          const originalCwd = process.cwd();
          process.chdir(serverDir);
          console.log('Changed working directory to:', process.cwd());
          
          // Require and start the Next.js server directly
          console.log('Loading Next.js server module...');
          require(serverPath);
          console.log('Next.js server started!');
          
          // Wait for server to be ready
          setTimeout(() => {
            waitForServer(PORT)
              .then(() => {
                console.log('✓ Server verified and ready');
                resolve();
              })
              .catch(reject);
          }, 2000); // Give it 2 seconds to start listening
          
        } catch (error) {
          console.error('Error starting Next.js server:', error);
          reject(error);
        }
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
  console.log('Shutting down application...');
  
  // In production mode with direct require, Next.js runs in the same process
  // and will shut down with the app. Only kill child process in dev mode.
  if (nextServer && typeof nextServer.kill === 'function') {
    console.log('Stopping Next.js server process...');
    nextServer.kill('SIGTERM');
    
    // Force kill after 5 seconds if not stopped
    setTimeout(() => {
      if (nextServer && !nextServer.killed) {
        nextServer.kill('SIGKILL');
      }
    }, 5000);
  } else {
    console.log('Next.js server will shut down with main process');
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Application Error', error.message);
});
