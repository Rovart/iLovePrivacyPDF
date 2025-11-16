import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Please upload at least 2 PDF files to merge' },
        { status: 400 }
      );
    }

    // Create output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), 'public', 'outputs');
    await mkdir(outputDir, { recursive: true });

    // Create a new PDF document
    const mergedPdf = await PDFDocument.create();

    // Process each PDF file in order
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      // Copy all pages from this PDF to the merged PDF
      const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    // Save the merged PDF
    const mergedPdfBytes = await mergedPdf.save();
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const outputFilename = `merged_${timestamp}.pdf`;
    const outputPath = path.join(outputDir, outputFilename);

    await writeFile(outputPath, Buffer.from(mergedPdfBytes));

    return NextResponse.json({
      success: true,
      pdf_url: `/api/serve-image?path=outputs/${outputFilename}&t=${Date.now()}`,
    });
  } catch (error: any) {
    console.error('Error merging PDFs:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to merge PDFs' },
      { status: 500 }
    );
  }
}
