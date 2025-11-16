import { execSync } from 'child_process';
import { platform } from 'os';

export interface DependencyInfo {
  name: string;
  installed: boolean;
  version?: string;
  installCommand: string;
}

/**
 * Check if a command exists in the system PATH
 */
export function checkCommandExists(command: string): boolean {
  try {
    const os = platform();
    const checkCmd = os === 'win32' ? `where ${command}` : `which ${command}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get install command for poppler based on OS
 */
export function getPopplerInstallCommand(): string {
  const os = platform();
  
  switch (os) {
    case 'darwin':
      return 'brew install poppler';
    case 'linux':
      // Check for common Linux distributions
      try {
        execSync('which apt-get', { stdio: 'ignore' });
        return 'sudo apt-get install poppler-utils';
      } catch {
        try {
          execSync('which yum', { stdio: 'ignore' });
          return 'sudo yum install poppler-utils';
        } catch {
          try {
            execSync('which pacman', { stdio: 'ignore' });
            return 'sudo pacman -S poppler';
          } catch {
            return 'sudo apt-get install poppler-utils (or equivalent for your distro)';
          }
        }
      }
    case 'win32':
      return 'choco install poppler (or download from https://github.com/oschwartz10612/poppler-windows/releases)';
    default:
      return 'Please install poppler for your OS';
  }
}

/**
 * Check if poppler (pdftoppm) is installed
 */
export function checkPoppler(): DependencyInfo {
  const installed = checkCommandExists('pdftoppm');
  
  return {
    name: 'poppler',
    installed,
    installCommand: getPopplerInstallCommand()
  };
}

/**
 * Get all dependency statuses
 */
export function checkAllDependencies(): Record<string, DependencyInfo> {
  return {
    poppler: checkPoppler()
  };
}

/**
 * Format dependency check results for display
 */
export function formatDependencyStatus(deps: Record<string, DependencyInfo>): {
  allMissing: DependencyInfo[];
  allInstalled: boolean;
  message: string;
} {
  const missing = Object.values(deps).filter(d => !d.installed);
  const allInstalled = missing.length === 0;
  
  let message = '';
  if (allInstalled) {
    message = '✓ All dependencies are installed';
  } else {
    message = '⚠ Missing dependencies:\n';
    missing.forEach(dep => {
      message += `\n${dep.name}:\n`;
      message += `  Install: ${dep.installCommand}\n`;
    });
  }
  
  return {
    allMissing: missing,
    allInstalled,
    message
  };
}