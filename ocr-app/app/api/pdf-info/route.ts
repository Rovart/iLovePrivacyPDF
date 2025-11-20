import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { checkPoppler } from '@/lib/dependencies';
import { getUploadsDir } from '@/lib/paths';

export async function POST(request: NextRequest) {
  let tempPath: string | null = null;

  try {
    // Check if poppler is installed
    const poppler = checkPoppler();
    if (!poppler.installed) {
      return NextResponse.json(
        {
          success: false,
          error: 'poppler is not installed',
          installCommand: poppler.installCommand,
        },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Please upload a PDF file' },
        { status: 400 }
      );
    }

    if (!file.type.includes('pdf')) {
      return NextResponse.json(
        { success: false, error: 'Only PDF files are supported' },
        { status: 400 }
      );
    }

    // Save the uploaded file temporarily with unique name
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const timestamp = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const uploadsDir = getUploadsDir();
    tempPath = path.join(uploadsDir, `temp_pdfinfo_${timestamp}.pdf`);

    console.log('[pdf-info] Creating temp file:', tempPath);
    await writeFile(tempPath, buffer);

    try {
      // Use pdfinfo to get page count
      const pdfinfo = await new Promise<string>((resolve, reject) => {
        const process = spawn('pdfinfo', [tempPath!]);
        let output = '';
        let errorOutput = '';

        process.stdout.on('data', (data) => {
          output += data.toString();
        });

        process.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        process.on('close', (code) => {
          if (code === 0) {
            resolve(output);
          } else {
            reject(new Error(`pdfinfo failed: ${errorOutput}`));
          }
        });
      });

      // Parse page count from pdfinfo output
      const pageMatch = pdfinfo.match(/Pages:\s*(\d+)/);
      const pageCount = pageMatch ? parseInt(pageMatch[1], 10) : 0;

      if (pageCount === 0) {
        return NextResponse.json(
          { success: false, error: 'Could not determine page count' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        pageCount,
      });
    } finally {
      // Always clean up temp file
      if (tempPath) {
        try {
          console.log('[pdf-info] Deleting temp file:', tempPath);
          await unlink(tempPath);
          console.log('[pdf-info] Temp file deleted successfully');
        } catch (unlinkError) {
          console.error('[pdf-info] Failed to delete temp file:', tempPath, unlinkError);
        }
      }
    }
  } catch (error: any) {
    console.error('PDF info error:', error);

    // Cleanup on error
    if (tempPath) {
      try {
        console.log('[pdf-info] Cleaning up temp file on error:', tempPath);
        await unlink(tempPath);
      } catch (unlinkError) {
        console.error('[pdf-info] Failed to cleanup temp file on error:', unlinkError);
      }
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get PDF info' },
      { status: 500 }
    );
  }
}
