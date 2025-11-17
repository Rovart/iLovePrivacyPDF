import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Get the path to the Rust binary, handling both development and packaged Electron app
 */
export function getRustBinaryPath(): string {
  // Check if we're in a packaged Electron app
  // @ts-ignore - resourcesPath is added by Electron
  const resourcesPath = process.resourcesPath as string | undefined;
  
  if (resourcesPath && existsSync(resourcesPath)) {
    // In packaged Electron app, the binary is in resources/
    const possiblePaths = [
      join(resourcesPath, 'iloveprivacypdf'), // Linux/macOS
      join(resourcesPath, 'iloveprivacypdf.exe'), // Windows
      join(resourcesPath, '..', 'MacOS', 'iloveprivacypdf'), // macOS app bundle alternative
    ];
    
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        console.log(`[Rust Binary] Using packaged binary: ${path}`);
        return path;
      }
    }
  }
  
  // Development mode: use the standard path
  const devPath = join(process.cwd(), '..', 'ocr-rust', 'target', 'release', 'iloveprivacypdf');
  console.log(`[Rust Binary] Using development binary: ${devPath}`);
  return devPath;
}
