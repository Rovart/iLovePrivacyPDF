import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: 'No files provided' }, { status: 400 });
    }

    const file = files[0];
    if (!file.name.endsWith('.md')) {
      return NextResponse.json({ success: false, error: 'Only markdown files accepted' }, { status: 400 });
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

    // Save markdown file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const inputPath = join(uploadsDir, file.name);
    await writeFile(inputPath, buffer);

    // Get the Rust binary path
    const rustBinaryPath = join(process.cwd(), '..', 'ocr-rust', 'target', 'release', 'iloveprivacypdf');
    
    // Generate output filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputPdf = join(outputDir, `documento_${timestamp}.pdf`);

    // Convert markdown to PDF using Rust
    const command = `"${rustBinaryPath}" markdown-to-pdf --input "${inputPath}" --output "${outputPdf}"`;
    console.log('Executing:', command);
    await execAsync(command);

    // Return URL to download PDF
    const pdfFilename = outputPdf.split('/').pop();
    return NextResponse.json({
      success: true,
      pdf_url: `/api/serve-image?path=output/${pdfFilename}&t=${Date.now()}`,
      markdown_url: `/api/serve-image?path=uploads/${file.name}&t=${Date.now()}`,
    });
  } catch (error: any) {
    console.error('Conversion error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Conversion failed' },
      { status: 500 }
    );
  }
}
