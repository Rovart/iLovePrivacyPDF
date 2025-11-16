import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files } = body;

    if (!Array.isArray(files)) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
    }

    const outputDir = join(process.cwd(), 'public', 'outputs');
    const existingFiles: string[] = [];

    for (const file of files) {
      // Extract just the filename from the path/URL
      let filename = file;
      if (file.includes('/')) {
        filename = file.split('/').pop();
      }
      if (filename.includes('?')) {
        filename = filename.split('?')[0];
      }

      const filePath = join(outputDir, filename);
      if (existsSync(filePath)) {
        existingFiles.push(file);
      }
    }

    return NextResponse.json({
      success: true,
      existingFiles,
    });
  } catch (error: any) {
    console.error('Check files error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to check files' },
      { status: 500 }
    );
  }
}
