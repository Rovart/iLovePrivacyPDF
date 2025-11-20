import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { getOutputsDir } from '@/lib/paths';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const targetFormat = formData.get('format') as string;
    const quality = parseInt(formData.get('quality') as string) || 90;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    if (!targetFormat || !['jpeg', 'png', 'webp', 'avif', 'tiff'].includes(targetFormat)) {
      return NextResponse.json({ success: false, error: 'Invalid target format' }, { status: 400 });
    }

    // Create necessary directories
    const outputDir = getOutputsDir();

    // Read the uploaded file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate output filename
    const originalName = file.name.replace(/\.[^/.]+$/, '');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputFilename = `${originalName}_${timestamp}.${targetFormat}`;
    const outputPath = join(outputDir, outputFilename);

    // Convert image using sharp
    let sharpInstance = sharp(buffer);

    // Apply format-specific options
    switch (targetFormat) {
      case 'jpeg':
        sharpInstance = sharpInstance.jpeg({ quality, mozjpeg: true });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ compressionLevel: 9 });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({ quality });
        break;
      case 'avif':
        sharpInstance = sharpInstance.avif({ quality });
        break;
      case 'tiff':
        sharpInstance = sharpInstance.tiff({ compression: 'lzw' });
        break;
    }

    // Save the converted image
    await sharpInstance.toFile(outputPath);

    // Return URL to download the converted image
    return NextResponse.json({
      success: true,
      imageUrl: `/api/serve-image?path=outputs/${outputFilename}&t=${Date.now()}`,
      filename: outputFilename,
    });
  } catch (error: any) {
    console.error('Image conversion error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Conversion failed' },
      { status: 500 }
    );
  }
}
