import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const HISTORY_FILE = join(process.cwd(), 'public', 'outputs', '.history.json');

type HistoryItem = {
  id: string;
  timestamp: string;
  mode: string;
  markdownUrl?: string;
  pdfUrl?: string;
  images?: string[];
  imageCount?: number;
};

// GET - Load history
export async function GET() {
  try {
    // Ensure outputs directory exists
    const outputDir = join(process.cwd(), 'public', 'outputs');
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    if (!existsSync(HISTORY_FILE)) {
      return NextResponse.json({ success: true, history: [] });
    }

    const data = await readFile(HISTORY_FILE, 'utf-8');
    const history: HistoryItem[] = JSON.parse(data);

    // Verify which files still exist
    const validHistory = history.filter(item => {
      let hasValidFile = false;

      // Helper function to extract filename from various URL formats
      const extractFilename = (url: string): string | null => {
        if (!url) return null;
        
        // Handle /api/serve-image?path=outputs/filename format
        if (url.includes('?path=')) {
          const pathMatch = url.match(/path=outputs%2F(.+?)(?:&|$)/);
          if (pathMatch) return decodeURIComponent(pathMatch[1].split('?')[0]);
          
          const pathMatch2 = url.match(/path=outputs\/(.+?)(?:&|$)/);
          if (pathMatch2) return pathMatch2[1].split('?')[0];
        }
        
        // Handle direct /api/serve-image?path=outputs/filename&t=... format
        if (url.includes('/api/serve-image')) {
          const urlObj = new URL(url, 'http://localhost');
          const pathParam = urlObj.searchParams.get('path');
          if (pathParam) {
            return pathParam.replace('outputs/', '');
          }
        }
        
        // Handle direct file paths like /api/serve-image?path=outputs/filename
        const simpleMatch = url.split('?')[0].split('/').pop();
        if (simpleMatch && !simpleMatch.includes('serve-image')) {
          return simpleMatch;
        }
        
        return null;
      };

      // Check markdown file
      if (item.markdownUrl) {
        const filename = extractFilename(item.markdownUrl);
        if (filename) {
          const filePath = join(outputDir, filename);
          if (existsSync(filePath)) {
            hasValidFile = true;
          } else {
            item.markdownUrl = undefined;
          }
        }
      }

      // Check PDF file
      if (item.pdfUrl) {
        const filename = extractFilename(item.pdfUrl);
        if (filename) {
          const filePath = join(outputDir, filename);
          if (existsSync(filePath)) {
            hasValidFile = true;
          } else {
            item.pdfUrl = undefined;
          }
        }
      }

      // Check image files
      if (item.images && item.images.length > 0) {
        const validImages = item.images.filter(imgUrl => {
          const filename = extractFilename(imgUrl);
          if (filename) {
            const filePath = join(outputDir, filename);
            return existsSync(filePath);
          }
          return false;
        });

        if (validImages.length > 0) {
          item.images = validImages;
          item.imageCount = validImages.length;
          hasValidFile = true;
        } else {
          item.images = undefined;
          item.imageCount = undefined;
        }
      }

      return hasValidFile;
    });

    // Update history file with only valid items
    if (validHistory.length !== history.length) {
      await writeFile(HISTORY_FILE, JSON.stringify(validHistory, null, 2));
    }

    return NextResponse.json({ success: true, history: validHistory });
  } catch (error: any) {
    console.error('Error loading history:', error);
    return NextResponse.json(
      { success: false, error: error.message, history: [] },
      { status: 500 }
    );
  }
}

// POST - Add to history
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { item } = body;

    if (!item) {
      return NextResponse.json(
        { success: false, error: 'No item provided' },
        { status: 400 }
      );
    }

    // Ensure outputs directory exists
    const outputDir = join(process.cwd(), 'public', 'outputs');
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    // Load existing history
    let history: HistoryItem[] = [];
    if (existsSync(HISTORY_FILE)) {
      const data = await readFile(HISTORY_FILE, 'utf-8');
      history = JSON.parse(data);
    }

    // Add new item to the beginning
    const newItem: HistoryItem = {
      ...item,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
    };

    history.unshift(newItem);

    // Keep only last 50 items
    history = history.slice(0, 50);

    // Save history
    await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));

    return NextResponse.json({ success: true, item: newItem });
  } catch (error: any) {
    console.error('Error saving history:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Remove item from history
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'No ID provided' },
        { status: 400 }
      );
    }

    if (!existsSync(HISTORY_FILE)) {
      return NextResponse.json({ success: true });
    }

    // Load existing history
    const data = await readFile(HISTORY_FILE, 'utf-8');
    let history: HistoryItem[] = JSON.parse(data);

    // Filter out the item
    history = history.filter(item => item.id !== id);

    // Save updated history
    await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting history item:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PUT - Clear all history
export async function PUT() {
  try {
    // Clear history file
    await writeFile(HISTORY_FILE, JSON.stringify([], null, 2));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error clearing history:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
