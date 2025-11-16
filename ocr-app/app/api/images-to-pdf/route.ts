import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please upload at least one image' },
        { status: 400 }
      );
    }

    // Create output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), 'public', 'outputs');
    await mkdir(outputDir, { recursive: true });

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();

    // Process each image file in order
    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Convert image to JPEG if it's not already (for better compatibility)
        const processedImage = await sharp(buffer)
          .jpeg({ quality: 90 })
          .toBuffer();

        // Embed image in PDF
        const image = await pdfDoc.embedJpg(processedImage);
        const imageDims = image.scale(1);

        // Calculate page size to fit the image
        // A4 size in points: 595.28 x 841.89
        const maxWidth = 595.28;
        const maxHeight = 841.89;
        
        let pageWidth = imageDims.width;
        let pageHeight = imageDims.height;

        // Scale down if image is larger than A4
        if (pageWidth > maxWidth || pageHeight > maxHeight) {
          const widthRatio = maxWidth / pageWidth;
          const heightRatio = maxHeight / pageHeight;
          const scale = Math.min(widthRatio, heightRatio);
          
          pageWidth = pageWidth * scale;
          pageHeight = pageHeight * scale;
        }

        // Add a new page with the image dimensions
        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        // Draw the image to fill the entire page
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
        });
      } catch (imageError: any) {
        console.error(`Error processing image ${file.name}:`, imageError);
        // Continue with other images even if one fails
      }
    }

    // Check if we successfully added any pages
    if (pdfDoc.getPageCount() === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to process any images' },
        { status: 500 }
      );
    }

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const outputFilename = `images_${timestamp}.pdf`;
    const outputPath = path.join(outputDir, outputFilename);

    await writeFile(outputPath, Buffer.from(pdfBytes));

    return NextResponse.json({
      success: true,
      pdf_url: `/api/serve-image?path=outputs/${outputFilename}&t=${Date.now()}`,
    });
  } catch (error: any) {
    console.error('Error creating PDF from images:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create PDF from images' },
      { status: 500 }
    );
  }
}
