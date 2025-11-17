import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { exec, spawnSync } from 'child_process';
import { promisify } from 'util';
import { getRustBinaryPath } from '@/lib/rust-binary';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const useCoordinates = formData.get('useCoordinates') === 'true';

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: 'No files provided' }, { status: 400 });
    }

    // Create necessary directories
    const uploadsDir = join(process.cwd(), 'public', 'uploads');
    const outputDir = join(process.cwd(), 'public', 'outputs');
    
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    // Clean uploads directory to prevent file persistence
    try {
      const uploadFiles = await readdir(uploadsDir);
      for (const file of uploadFiles) {
        await unlink(join(uploadsDir, file));
      }
    } catch (err) {
      // Directory might be empty or not exist yet, ignore
    }

    // Save uploaded files
    const savedFiles: string[] = [];
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const filePath = join(uploadsDir, file.name);
      await writeFile(filePath, buffer);
      savedFiles.push(filePath);
    }

    // Get the Rust binary path
    const rustBinaryPath = getRustBinaryPath();
    
    // Generate output filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputMarkdown = join(outputDir, `documento_${timestamp}.md`);
    const outputPdf = join(outputDir, `documento_${timestamp}.pdf`);

    // Determine if we have PDFs or images
    const hasPdf = savedFiles.some(f => f.endsWith('.pdf'));
    
  let command: string;
  let usedFallback = false;
    if (hasPdf && savedFiles.length === 1) {
      // Process PDF
      // Detect pdftoppm on the system
      const whichResult = spawnSync('which', ['pdftoppm']);
      const hasPdftoppm = whichResult.status === 0;
      if (!hasPdftoppm) {
        // Optionally auto-install poppler if env var is set
        if (process.env.AUTO_INSTALL_POPPLER === 'true') {
          try {
            if (process.platform === 'darwin') {
              await execAsync('brew install poppler');
            } else if (process.platform === 'linux') {
              await execAsync('sudo apt-get update && sudo apt-get install -y poppler-utils');
            } else if (process.platform === 'win32') {
              await execAsync('choco install poppler');
            }
          } catch (e) {
            console.warn('Auto-install of poppler failed:', e);
          }
        }
        // After attempting install, re-check presence
        const whichResult2 = spawnSync('which', ['pdftoppm']);
        const hasPdftoppm2 = whichResult2.status === 0;
        if (!hasPdftoppm2) {
          // Use native pdf-extract fallback if pdftoppm is not available
          command = `"${rustBinaryPath}" process-pdf --input "${savedFiles[0]}" --output "${outputMarkdown}" --use-native`;
          usedFallback = true;
        } else {
          command = `"${rustBinaryPath}" process-pdf --input "${savedFiles[0]}" --output "${outputMarkdown}"`;
        }
      } else {
        command = `"${rustBinaryPath}" process-pdf --input "${savedFiles[0]}" --output "${outputMarkdown}"`;
      }
    } else {
      // Process images from directory
      command = `"${rustBinaryPath}" process-dir --input "${uploadsDir}" --output "${outputMarkdown}"`;
    }

    // Execute Rust OCR processor
    console.log('Executing:', command);
    await execAsync(command);

    // Convert markdown to PDF using Rust
    const coordinatesFlag = useCoordinates ? ' --use-coordinates' : '';
    const pdfCommand = `"${rustBinaryPath}" markdown-to-pdf --input "${outputMarkdown}" --output "${outputPdf}"${coordinatesFlag}`;
    console.log('Executing:', pdfCommand);
    await execAsync(pdfCommand);

    // Return URLs to download files
    const markdownFilename = outputMarkdown.split('/').pop();
    const pdfFilename = outputPdf.split('/').pop();
    
    // Clean up uploaded files after successful processing
    try {
      for (const filePath of savedFiles) {
        await unlink(filePath);
      }
      console.log('Cleaned up uploaded files');
    } catch (cleanupError) {
      console.error('Error cleaning up uploaded files:', cleanupError);
      // Don't fail the request if cleanup fails
    }
    
    return NextResponse.json({
      success: true,
      fallback: usedFallback,
      markdown_url: `/api/serve-image?path=outputs/${markdownFilename}&t=${Date.now()}`,
      pdf_url: `/api/serve-image?path=outputs/${pdfFilename}&t=${Date.now()}`,
    });
  } catch (error: any) {
    console.error('Processing error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Processing failed' },
      { status: 500 }
    );
  }
}
