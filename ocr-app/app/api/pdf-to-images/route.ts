import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { checkPoppler, getPopplerInstallCommand } from '@/lib/dependencies';
import { getTempImagesDir, getOutputsDir } from '@/lib/paths';

export async function POST(request: NextRequest) {
  try {
    // Check if poppler is installed
    const poppler = checkPoppler();
    if (!poppler.installed) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'poppler is not installed',
          installCommand: poppler.installCommand,
          missingDependency: true,
          message: `PDF extraction requires poppler. Install with:\n${poppler.installCommand}`
        },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please upload at least one PDF file' },
        { status: 400 }
      );
    }

    // Check if all files are PDFs
    const nonPdfFiles = files.filter(file => !file.type.includes('pdf'));
    if (nonPdfFiles.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Only PDF files are supported for PDF to images conversion' },
        { status: 400 }
      );
    }

    // Create necessary directories
    const tempDir = getTempImagesDir();
    const outputDir = getOutputsDir();
    
    // Clean temp directory
    if (existsSync(tempDir)) {
      const tempFiles = await readdir(tempDir);
      for (const file of tempFiles) {
        await unlink(path.join(tempDir, file));
      }
    }

    await mkdir(tempDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    const extractedImages: string[] = [];

    // Process each PDF file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Save PDF temporarily
      const pdfBuffer = Buffer.from(await file.arrayBuffer());
      const tempPdfPath = path.join(tempDir, `temp_pdf_${i}_${file.name}`);
      await writeFile(tempPdfPath, pdfBuffer);

      // Extract images from PDF using pdftoppm
      try {
        await extractPdfPages(tempPdfPath, tempDir, `pdf${i}_`);
        
        // Find all generated images for this PDF
        const tempFiles = await readdir(tempDir);
        const pdfImages = tempFiles.filter(f => 
          f.startsWith(`pdf${i}_`) && (f.endsWith('.png') || f.endsWith('.ppm'))
        ).sort();
        
        pdfImages.forEach(img => {
          extractedImages.push(path.join(tempDir, img));
        });

      } catch (error: any) {
        console.error(`Error extracting PDF ${file.name}:`, error);
        // Clean up temp PDF
        try {
          await unlink(tempPdfPath);
        } catch {}
        
        // Check if error is due to missing pdftoppm
        if (error.message.includes('ENOENT') || error.message.includes('pdftoppm not found')) {
          const installCmd = getPopplerInstallCommand();
          return NextResponse.json(
            { 
              success: false, 
              error: `Failed to extract PDF pages. poppler is not installed.`,
              installCommand: installCmd,
              missingDependency: true,
              message: `Install poppler with: ${installCmd}`
            },
            { status: 400 }
          );
        }
        
        return NextResponse.json(
          { 
            success: false, 
            error: `Failed to extract pages from ${file.name}. Make sure pdftoppm is installed.` 
          },
          { status: 500 }
        );
      }

      // Clean up temp PDF
      try {
        await unlink(tempPdfPath);
      } catch {}
    }

    if (extractedImages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No images could be extracted from the PDF files' },
        { status: 500 }
      );
    }

    // Move images to output directory with better names
    const timestamp = new Date().toISOString().replace(/:/g, '-').substring(0, 19);
    const finalImages: string[] = [];
    
    for (let i = 0; i < extractedImages.length; i++) {
      const originalPath = extractedImages[i];
      const extension = originalPath.endsWith('.png') ? 'png' : 'png'; // Convert all to PNG
      const newName = `page_${i + 1}.${extension}`;
      const finalPath = path.join(outputDir, `${timestamp}_${newName}`);
      
      // If it's a PPM file, we should convert it to PNG, but for now just copy
      try {
        const imageBuffer = await import('fs').then(fs => fs.promises.readFile(originalPath));
        await writeFile(finalPath, imageBuffer);
        
        // Verify file was written successfully before adding to list
        try {
          await import('fs').then(fs => fs.promises.access(finalPath));
          // Use API route to serve images to avoid caching issues
          finalImages.push(`/api/serve-image?path=outputs/${timestamp}_${newName}&t=${Date.now()}`);
        } catch {
          console.error(`File verification failed for ${finalPath}`);
        }
        
        // Clean up temp file
        await unlink(originalPath);
      } catch (error) {
        console.error(`Error processing image ${originalPath}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully extracted ${finalImages.length} images from ${files.length} PDF(s)`,
      images: finalImages,
      count: finalImages.length
    });

  } catch (error: any) {
    console.error('Error in PDF to images conversion:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to convert PDF to images' },
      { status: 500 }
    );
  }
}

// Helper function to extract PDF pages using pdftoppm
async function extractPdfPages(pdfPath: string, outputDir: string, prefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const outputPrefix = path.join(outputDir, prefix + 'page');
    
    // Use pdftoppm to extract PDF pages as PNG images
    const process = spawn('pdftoppm', [
      '-png',           // Output as PNG
      '-r', '150',      // 150 DPI (good quality, reasonable file size)
      pdfPath,          // Input PDF
      outputPrefix      // Output prefix
    ]);

    let stderr = '';

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pdftoppm failed with code ${code}: ${stderr}`));
      }
    });

    process.on('error', (error) => {
      if (error.message.includes('ENOENT')) {
        const installCmd = getPopplerInstallCommand();
        reject(new Error(`poppler-not-installed:${installCmd}`));
      } else {
        reject(error);
      }
    });
  });
}