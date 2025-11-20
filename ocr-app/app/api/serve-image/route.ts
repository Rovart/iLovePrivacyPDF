import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getStoragePath, getWritableRoot } from '@/lib/paths';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imagePath = searchParams.get('path');

    if (!imagePath) {
      return NextResponse.json(
        { success: false, error: 'Image path is required' },
        { status: 400 }
      );
    }

    // Sanitize the path to prevent directory traversal
    const sanitizedPath = imagePath.replace(/^\//, '');
    const fullPath = getStoragePath(sanitizedPath);

    // Verify the file exists and is within the storage directory
    const storageRoot = getWritableRoot();
    if (!fullPath.startsWith(storageRoot)) {
      return NextResponse.json(
        { success: false, error: 'Invalid path' },
        { status: 403 }
      );
    }

    if (!existsSync(fullPath)) {
      return NextResponse.json(
        { success: false, error: 'Image not found' },
        { status: 404 }
      );
    }

    // Read the file
    const imageBuffer = await readFile(fullPath);

    // Determine content type based on file extension
    const ext = path.extname(fullPath).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.md': 'text/markdown',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Determine Content-Disposition based on file type
    const isPdf = ext === '.pdf';
    const isMarkdown = ext === '.md';
    const contentDisposition = (isPdf || isMarkdown)
      ? `attachment; filename="${path.basename(fullPath)}"`
      : 'inline';

    // Return the file with proper headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error: any) {
    console.error('Error serving image:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to serve image' },
      { status: 500 }
    );
  }
}
