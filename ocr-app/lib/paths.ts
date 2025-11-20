import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import os from 'os';

/**
 * Get the base directory for file operations
 * In Electron packaged app: Contents/app/.next/standalone
 * In dev mode: project root
 */
export function getBaseDir(): string {
  const cwd = process.cwd();

  // Check if running in Electron packaged app
  // In packaged app, cwd is like: /Applications/iLovePrivacyPDF.app/Contents/app/.next/standalone
  if (cwd.includes('.app/Contents/app')) {
    return cwd;
  }

  // In dev mode, cwd is the project root
  return cwd;
}

/**
 * Get the writable root directory for data storage
 * In Electron packaged app: temp dir/iLovePrivacyPDF
 * In dev mode: project root/public
 */
export function getWritableRoot(): string {
  const cwd = process.cwd();

  // Check if running in Electron packaged app
  if (cwd.includes('.app/Contents/app')) {
    // Use system temp directory for packaged app to avoid permission issues
    // and read-only file system errors
    const tempDir = path.join(os.tmpdir(), 'iLovePrivacyPDF');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
  }

  // In dev mode, use public dir in project
  return path.join(cwd, 'public');
}

/**
 * Get path to storage directory with automatic creation of subdirectories
 */
export function getStoragePath(...segments: string[]): string {
  const basePath = path.join(getWritableRoot(), ...segments);

  // Ensure the directory exists
  if (!existsSync(basePath)) {
    mkdirSync(basePath, { recursive: true });
  }

  return basePath;
}

/**
 * Get path to uploads directory
 */
export function getUploadsDir(): string {
  return getStoragePath('uploads');
}

/**
 * Get path to outputs directory
 */
export function getOutputsDir(): string {
  return getStoragePath('outputs');
}

/**
 * Get path to temp images directory
 */
export function getTempImagesDir(): string {
  return getStoragePath('temp_images');
}

/**
 * Ensure all required directories exist
 */
export function ensureDirectories(): void {
  getUploadsDir();
  getOutputsDir();
  getTempImagesDir();
}
