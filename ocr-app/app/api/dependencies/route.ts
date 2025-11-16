import { NextResponse } from 'next/server';
import { checkAllDependencies, formatDependencyStatus } from '@/lib/dependencies';

export async function GET() {
  try {
    const dependencies = checkAllDependencies();
    const status = formatDependencyStatus(dependencies);
    
    return NextResponse.json({
      success: true,
      allInstalled: status.allInstalled,
      dependencies: dependencies,
      message: status.message,
      missingDependencies: status.allMissing.map(dep => ({
        name: dep.name,
        installCommand: dep.installCommand
      }))
    });
  } catch (error: any) {
    console.error('Error checking dependencies:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to check dependencies',
      allInstalled: false,
      dependencies: {}
    }, { status: 500 });
  }
}