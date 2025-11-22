import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ModelInfo {
  id: string;
  label: string;
  provider: 'nexa' | 'ollama';
  status: 'available' | 'unavailable' | 'missing';
  error?: string;
}

// Check if Nexa CLI is installed and get default model
async function checkNexaCLI(): Promise<ModelInfo[]> {
  try {
    // Check if nexa command exists
    await execAsync('which nexa');

    // Nexa is installed, return default OCR model
    return [{
      id: 'NexaAI/DeepSeek-OCR-GGUF:BF16',
      label: 'DeepSeek OCR (NexaAI)',
      provider: 'nexa',
      status: 'available'
    }];
  } catch (error) {
    console.log('Nexa CLI not installed');
    return [];
  }
}

// Check if Ollama CLI is installed and get available models
async function checkOllamaCLI(): Promise<ModelInfo[]> {
  try {
    // Check if ollama command exists
    await execAsync('which ollama');

    // Try to get list of installed models via CLI
    try {
      const { stdout } = await execAsync('ollama list');
      const lines = stdout.split('\n').slice(1); // Skip header

      const ollamaModels: ModelInfo[] = [];
      const visionModelPatterns = [
        'qwen2-vl', 'qwen-vl', 'llava', 'bakllava', 'minicpm-v',
        'cogvlm', 'moondream', 'gemma', 'pixtral', 'phi3.5-vision',
        'deepseek-ocr'
      ];

      for (const line of lines) {
        if (!line.trim()) continue;
        const modelName = line.split(/\s+/)[0]; // Get first column (model name)
        if (!modelName) continue;

        const modelLower = modelName.toLowerCase();
        const isVisionModel = visionModelPatterns.some(pattern =>
          modelLower.includes(pattern)
        );

        if (isVisionModel) {
          const displayName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
          ollamaModels.push({
            id: modelName,
            label: `${displayName} (Ollama)`,
            provider: 'ollama',
            status: 'available'
          });
        }
      }

      // Check if deepseek-ocr is installed (handle version tags like :latest)
      const hasDeepSeek = ollamaModels.some(m => m.id.startsWith('deepseek-ocr'));

      if (!hasDeepSeek) {
        // Add deepseek-ocr as missing so user can install it
        ollamaModels.unshift({
          id: 'deepseek-ocr',
          label: 'DeepSeek OCR (Ollama)',
          provider: 'ollama',
          status: 'missing'
        });
      }

      return ollamaModels;
    } catch (listError) {
      // ollama list failed (likely server not running), but CLI exists
      // Return default deepseek-ocr so it can be selected and auto-started
      console.log('Ollama CLI installed but list failed (server down?), defaulting to deepseek-ocr');
      return [{
        id: 'deepseek-ocr',
        label: 'DeepSeek OCR (Ollama)',
        provider: 'ollama',
        status: 'available'
      }];
    }
  } catch (error) {
    console.log('Ollama CLI not installed');
    return [];
  }
}

export async function GET() {
  try {
    // Check both CLI tools in parallel (not servers, just if tools are installed)
    const [nexaModels, ollamaModels] = await Promise.all([
      checkNexaCLI(),
      checkOllamaCLI()
    ]);

    const allModels = [...ollamaModels, ...nexaModels];

    // Return models or empty list (no fallbacks)
    return NextResponse.json({
      success: true,
      models: allModels,
      message: allModels.length > 0
        ? `Found ${allModels.length} available OCR model(s)`
        : 'No OCR models found. Install Nexa or Ollama with vision models.',
      hasAvailableModels: allModels.length > 0
    });

  } catch (error: any) {
    console.error('Error checking OCR models:', error);

    return NextResponse.json({
      success: false,
      error: 'Failed to check OCR model availability',
      models: [],
      hasAvailableModels: false
    }, { status: 500 });
  }
}