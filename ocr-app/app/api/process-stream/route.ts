import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { spawn, spawnSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Helper to check if server is running
async function isServerRunning(port: number): Promise<boolean> {
  try {
    const url = port === 18181 
      ? 'http://127.0.0.1:18181/v1/models'
      : 'http://127.0.0.1:11434/api/tags';
    
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

// Stop server to free VRAM
async function stopServer(model: string): Promise<void> {
  const isNexa = model.includes('NexaAI') || model.includes('GGUF');
  const port = isNexa ? 18181 : 11434;
  
  console.log(`Stopping ${isNexa ? 'Nexa' : 'Ollama'} server to free VRAM...`);
  
  try {
    if (isNexa) {
      // Kill nexa serve processes
      await execAsync('pkill -f "nexa serve"').catch(() => {});
    } else {
      // Kill ollama serve processes
      await execAsync('killall ollama').catch(() => {});
    }
    
    // Wait a moment for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`${isNexa ? 'Nexa' : 'Ollama'} server stopped`);
  } catch (error) {
    console.error('Error stopping server:', error);
  }
}

// Start server if not running
async function ensureServerRunning(model: string): Promise<void> {
  const isNexa = model.includes('NexaAI') || model.includes('GGUF');
  const port = isNexa ? 18181 : 11434;
  
  if (await isServerRunning(port)) {
    console.log(`Server already running on port ${port}`);
    return;
  }
  
  console.log(`Starting ${isNexa ? 'Nexa' : 'Ollama'} server...`);
  
  if (isNexa) {
    spawn('nexa', ['serve', '--host', '127.0.0.1:18181'], {
      detached: true,
      stdio: 'ignore'
    }).unref();
    
    // Wait for server to be ready
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (await isServerRunning(port)) {
        console.log('Nexa server ready');
        return;
      }
    }
    throw new Error('Nexa server failed to start');
  } else {
    spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore'
    }).unref();
    
    // Wait for server to be ready
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (await isServerRunning(port)) {
        console.log('Ollama server ready');
        return;
      }
    }
    throw new Error('Ollama server failed to start');
  }
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      let ocrModel = 'NexaAI/DeepSeek-OCR-GGUF:BF16'; // Default, will be overwritten
      try {
        const formData = await request.formData();
        const files = formData.getAll('files') as File[];
        const useCoordinates = formData.get('useCoordinates') === 'true';
        ocrModel = formData.get('ocrModel') as string || 'NexaAI/DeepSeek-OCR-GGUF:BF16';
        const joinImages = formData.get('joinImages') === 'true';
        const customPrompt = formData.get('customPrompt') as string | null;

        if (files.length === 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'No files provided' })}\n\n`));
          controller.close();
          return;
        }

        // Create necessary directories
        const uploadsDir = join(process.cwd(), 'public', 'uploads');
        const outputDir = join(process.cwd(), 'public', 'outputs');
        const tempDir = join(process.cwd(), 'public', 'temp_images');
        
        for (const dir of [uploadsDir, outputDir, tempDir]) {
          if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
          }
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

        // Clean temp directory
        if (existsSync(tempDir)) {
          const tempFiles = await readdir(tempDir);
          for (const file of tempFiles) {
            await unlink(join(tempDir, file));
          }
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

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          status: 'uploading', 
          message: `Uploaded ${files.length} file(s)` 
        })}\n\n`));

        // Ensure the required server is running before processing
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            status: 'starting', 
            message: 'Starting OCR engine...' 
          })}\n\n`));
          
          await ensureServerRunning(ocrModel);
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            status: 'ready', 
            message: 'OCR engine ready' 
          })}\n\n`));
        } catch (error: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            status: 'error', 
            error: `Failed to start OCR engine: ${error.message}` 
          })}\n\n`));
          controller.close();
          return;
        }

        // Get the Rust binary path
        const rustBinaryPath = join(process.cwd(), '..', 'ocr-rust', 'target', 'release', 'iloveprivacypdf');
        
        // Generate output filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const outputMarkdown = join(outputDir, `documento_${timestamp}.md`);
        const outputPdf = join(outputDir, `documento_${timestamp}.pdf`);

        // Determine if we have PDFs or images
        const hasPdf = savedFiles.some(f => f.endsWith('.pdf'));
        
  let args: string[];
        if (hasPdf && savedFiles.length === 1) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            status: 'extracting', 
            message: 'Extracting pages from PDF...' 
          })}\n\n`));
          
          // Check for pdftoppm availability before running Rust processing
          const whichResult = spawnSync('which', ['pdftoppm']);
          const hasPdftoppm = whichResult.status === 0;
          if (!hasPdftoppm) {
            // Optionally try to auto-install poppler if environment variable is set
            const autoInstall = process.env.AUTO_INSTALL_POPPLER === 'true';
            if (autoInstall) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                status: 'info',
                message: 'Attempting to auto-install poppler (pdftoppm)...'
              })}\n\n`));
              let installCmd: string | null = null;
              if (process.platform === 'darwin') {
                installCmd = 'brew install poppler';
              } else if (process.platform === 'linux') {
                installCmd = 'sudo apt-get update && sudo apt-get install -y poppler-utils';
              } else if (process.platform === 'win32') {
                installCmd = 'choco install poppler';
              }
              if (installCmd) {
                try {
                  // Try synchronous install attempt and wait for completion
                  const installResult = spawnSync(installCmd, { shell: true, stdio: 'inherit' });
                  if (installResult.status === 0) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'info', message: 'poppler installed successfully' })}\n\n`));
                  } else {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'warning', message: 'Auto-install failed. Using native fallback' })}\n\n`));
                  }
                } catch (e) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'warning', message: 'Auto-install threw an error. Using native fallback' })}\n\n`));
                }
              }
            }
            // Re-check presence after an optional auto-installation
            const whichResult2 = spawnSync('which', ['pdftoppm']);
            const hasPdftoppm2 = whichResult2.status === 0;
            if (!hasPdftoppm2) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'warning', message: 'pdftoppm still not available; using native fallback for PDF processing' })}\n\n`));
              args = ['process-pdf', '--input', savedFiles[0], '--output', outputMarkdown, '--temp-dir', tempDir, '--use-native'];
            } else {
              args = ['process-pdf', '--input', savedFiles[0], '--output', outputMarkdown, '--temp-dir', tempDir];
            }
            }
          else {
            args = ['process-pdf', '--input', savedFiles[0], '--output', outputMarkdown, '--temp-dir', tempDir];
          }
        } else {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            status: 'processing', 
            message: 'Processing images...' 
          })}\n\n`));
          
          args = ['process-dir', '--input', uploadsDir, '--output', outputMarkdown];
          
          // Add model parameter
          if (ocrModel) {
            args.push('--model', ocrModel);
          }
          
          // Add custom prompt parameter for Ollama models
          if (customPrompt && customPrompt.trim()) {
            args.push('--custom-prompt', customPrompt.trim());
          }
          
          // Add use-coordinates flag if enabled
          if (useCoordinates) {
            args.push('--use-coordinates');
          }
          
          // Add join-images flag if enabled
          if (joinImages) {
            args.push('--join-images');
          }
        }

        // Execute Rust OCR processor with streaming output
        const rustProcess = spawn(rustBinaryPath, args);

        rustProcess.stdout.on('data', (data) => {
          const output = data.toString();
          console.log('Rust stdout:', output);
          
          // Parse progress from output
          const progressMatch = output.match(/\[(\d+)\/(\d+)\]\s+(\d+)%/);
          if (progressMatch) {
            const [, current, total, percentage] = progressMatch;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              status: 'processing', 
              message: `Processing image ${current}/${total}`,
              progress: parseInt(percentage)
            })}\n\n`));
          } else if (output.includes('Processing')) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              status: 'processing', 
              message: output.trim() 
            })}\n\n`));
          }
        });

        rustProcess.stderr.on('data', (data) => {
          console.error('Rust stderr:', data.toString());
        });

        await new Promise((resolve, reject) => {
          rustProcess.on('close', (code) => {
            if (code === 0) {
              resolve(null);
            } else {
              reject(new Error(`Process exited with code ${code}`));
            }
          });
          rustProcess.on('error', reject);
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          status: 'converting', 
          message: 'Converting to PDF...' 
        })}\n\n`));

        // Convert markdown to PDF using Rust
        const pdfArgs = [
          'markdown-to-pdf',
          '--input', outputMarkdown,
          '--output', outputPdf
        ];
        if (useCoordinates) {
          pdfArgs.push('--use-coordinates');
        }
        
        console.log('PDF conversion command:', rustBinaryPath, pdfArgs.join(' '));
        const pdfProcess = spawn(rustBinaryPath, pdfArgs);

        pdfProcess.stdout.on('data', (data) => {
          console.log('PDF stdout:', data.toString());
        });

        pdfProcess.stderr.on('data', (data) => {
          console.error('PDF stderr:', data.toString());
        });

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            pdfProcess.kill();
            reject(new Error('PDF conversion timed out after 60 seconds'));
          }, 60000);

          pdfProcess.on('close', (code) => {
            clearTimeout(timeout);
            if (code === 0) {
              resolve(null);
            } else {
              reject(new Error(`PDF conversion failed with code ${code}`));
            }
          });
          pdfProcess.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });

        // Return URLs to download files
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          status: 'complete',
          message: 'Processing complete!',
          markdown_url: `/api/serve-image?path=outputs/${outputMarkdown.split('/').pop()}&t=${Date.now()}`,
          pdf_url: `/api/serve-image?path=outputs/${outputPdf.split('/').pop()}&t=${Date.now()}`,
        })}\n\n`));

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

        // Auto-unload: Stop server to free VRAM after processing
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          status: 'cleanup',
          message: 'Freeing VRAM...'
        })}\n\n`));
        
        await stopServer(ocrModel);
        
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          status: 'done',
          message: 'Memory freed'
        })}\n\n`));

      } catch (error: any) {
        console.error('Processing error:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          status: 'error', 
          error: error.message || 'Processing failed' 
        })}\n\n`));
        
        // Also stop server on error to free VRAM
        try {
          await stopServer(ocrModel);
        } catch (stopError) {
          console.error('Error stopping server after failure:', stopError);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
