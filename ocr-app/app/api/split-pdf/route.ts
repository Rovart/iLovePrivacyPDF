import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getRustBinaryPath } from '@/lib/rust-binary';
import { getUploadsDir, getTempImagesDir } from '@/lib/paths';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const pageOrderJson = formData.get('pageOrder') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No PDF file provided' },
        { status: 400 }
      );
    }

    if (!pageOrderJson) {
      return NextResponse.json(
        { error: 'No page order provided' },
        { status: 400 }
      );
    }

    const pageOrder: number[] = JSON.parse(pageOrderJson);

    if (!Array.isArray(pageOrder) || pageOrder.length === 0) {
      return NextResponse.json(
        { error: 'Invalid page order' },
        { status: 400 }
      );
    }

    // Create necessary directories
    const uploadsDir = getUploadsDir();
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Save uploaded PDF
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const inputPath = path.join(uploadsDir, `${timestamp}_${safeName}`);
    const outputPath = path.join(uploadsDir, `${timestamp}_split_${safeName}`);

    console.log('[split-pdf] Saving file:', file.name, 'to', inputPath);
    const bytes = await file.arrayBuffer();
    await writeFile(inputPath, Buffer.from(bytes));
    console.log('[split-pdf] File saved successfully');

    console.log('[split-pdf] Page order:', pageOrder);

    // Use Rust binary to split and reorder PDF
    const rustBinary = getRustBinaryPath();
    const pageOrderStr = pageOrder.join(',');

    const command = `"${rustBinary}" split-pdf --input "${inputPath}" --output "${outputPath}" --pages "${pageOrderStr}"`;

    console.log('[split-pdf] Executing:', command);

    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      if (stderr) {
        console.error('[split-pdf] Rust stderr:', stderr);
      }
      if (stdout) {
        console.log('[split-pdf] Rust stdout:', stdout);
      }

      // Read the output file
      console.log('[split-pdf] Reading output file:', outputPath);
      const outputBuffer = await readFile(outputPath);

      // Clean up both input and output files
      try {
        await unlink(inputPath);
        await unlink(outputPath);
        console.log('[split-pdf] Cleaned up temp files');
      } catch (cleanupError) {
        console.error('[split-pdf] Failed to cleanup files:', cleanupError);
      }

      return new NextResponse(outputBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="split_${safeName}"`,
        },
      });

    } catch (execError: any) {
      console.error('[split-pdf] Error executing Rust binary:', execError);

      // Clean up on error
      try {
        await unlink(inputPath);
      } catch { }

      return NextResponse.json(
        {
          error: 'Failed to split PDF',
          details: execError.message
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('[split-pdf] Error in split-pdf route:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message
      },
      { status: 500 }
    );
  }
}
