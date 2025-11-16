'use client';

import { useState, useEffect } from 'react';
import { Upload, FileText, Image as ImageIcon, File, GripVertical, Moon, Sun } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type FileWithPreview = {
  file: File;
  preview?: string;
  id: string;
};

// Sortable file item component
function SortableFileItem({ item, index, onRemove, darkMode }: { item: FileWithPreview; index: number; onRemove: (index: number) => void; darkMode: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center p-3 border border-l-4 mb-3 shadow-[2px_2px_0_rgba(0,0,0,0.1)] hover:translate-x-1 transition-transform ${
        darkMode
          ? 'bg-[#3a3a3a] border-[#555] border-l-[#ffd700]'
          : 'bg-[#f4f1e8] border-[#d4d0c5] border-l-[#d4af37]'
      }`}>
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mr-3">
        <GripVertical className={`w-5 h-5 ${darkMode ? 'text-[#ffd700]' : 'text-[#2d4f7c]'}`} />
      </div>
      {item.preview ? (
        <img
          src={item.preview}
          alt={item.file.name}
          className={`w-14 h-14 object-cover border-2 mr-4 ${darkMode ? 'border-[#666]' : 'border-[#1a1a1a]'}`}
        />
      ) : (
        <File className={`w-14 h-14 mr-4 ${darkMode ? 'text-[#ffd700]' : 'text-[#2d4f7c]'}`} />
      )}
      <span className={`flex-1 font-mono text-sm ${darkMode ? 'text-[#ccc]' : 'text-[#1a1a1a]'}`}>
        {item.file.name}
      </span>
      <button
        onClick={() => onRemove(index)}
        className={`px-4 py-2 border-2 font-mono text-xs uppercase tracking-wider transition-all ${
          darkMode
            ? 'bg-[#c73e1d] text-[#f4f1e8] border-[#666] hover:bg-[#ffd700] hover:text-[#1a1a1a]'
            : 'bg-[#c73e1d] text-[#f4f1e8] border-[#1a1a1a] hover:bg-[#1a1a1a]'
        }`}>
        Remove
      </button>
    </div>
  );
}

type ModelInfo = {
  id: string;
  label: string;
  provider: 'nexa' | 'ollama';
  status: 'available' | 'unavailable';
  error?: string;
};

// Image thumbnail component with retry logic
function ImageThumbnail({ imageUrl, pageNumber, darkMode }: { imageUrl: string; pageNumber: number; darkMode: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(imageUrl);
  const MAX_RETRIES = 5;

  const handleImageLoad = () => {
    setLoaded(true);
    setError(false);
  };

  const handleImageError = () => {
    setError(true);
    
    // Retry with exponential backoff
    if (retryCount < MAX_RETRIES) {
      setRetrying(true);
      const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s, 4s, 8s
      setTimeout(() => {
        setRetryCount(retryCount + 1);
        setRetrying(false);
        // Force image reload with new timestamp
        const separator = imageUrl.includes('?') ? '&' : '?';
        setCurrentUrl(`${imageUrl}${separator}retry=${retryCount + 1}&t=${Date.now()}`);
      }, delay);
    }
  };

  return (
    <div className="relative group">
      <div className={`w-full h-20 border flex items-center justify-center ${
        darkMode ? 'bg-[#2a2a2a] border-[#444]' : 'bg-[#f0f0f0] border-[#ccc]'
      } ${loaded ? '' : ''}`}>
        <img
          key={currentUrl}
          src={currentUrl}
          alt={`Page ${pageNumber}`}
          className={`w-full h-20 object-cover border cursor-pointer transition-all hover:scale-105 ${
            darkMode ? 'border-[#444]' : 'border-[#ccc]'
          } ${error && !loaded ? 'hidden' : ''}`}
          onClick={() => window.open(currentUrl, '_blank')}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
        {error && !loaded && (
          <div className={`flex flex-col items-center justify-center w-full h-full text-xs text-center p-1 ${
            darkMode ? 'text-[#ff6b6b]' : 'text-[#c73e1d]'
          }`}>
            {retrying ? (
              <>
                <div>Loading...</div>
                <div className="text-xs opacity-70">Attempt {retryCount + 1}/{MAX_RETRIES}</div>
              </>
            ) : retryCount >= MAX_RETRIES ? (
              <>
                <div>Failed to load</div>
                <button 
                  onClick={() => {
                    setRetryCount(0);
                    setError(false);
                    setCurrentUrl(`${imageUrl}?manual=${Date.now()}`);
                  }}
                  className={`mt-1 text-xs underline ${darkMode ? 'hover:text-[#ffd700]' : 'hover:text-[#1a1a1a]'}`}
                >
                  Retry
                </button>
              </>
            ) : (
              <div>Loading image...</div>
            )}
          </div>
        )}
      </div>
      <div className={`absolute bottom-0 left-0 right-0 text-xs text-center py-1 font-mono ${
        darkMode ? 'bg-[#1a1a1a] text-[#ffd700]' : 'bg-[#f4f1e8] text-[#1a1a1a]'
      }`}>
        Page {pageNumber}
      </div>
    </div>
  );
}

// Download all images as zip
async function downloadAllImages(images: string[], timestamp?: string) {
  try {
    // Dynamic import to avoid bundling issues
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    
    // Add each image to the zip
    for (let i = 0; i < images.length; i++) {
      const imageUrl = images[i];
      // Remove query parameters for cleaner URLs
      const cleanUrl = imageUrl.split('?')[0];
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        console.error(`Failed to fetch image ${i + 1}: ${response.statusText}`);
        continue;
      }
      
      const blob = await response.blob();
      const filename = `page_${i + 1}.png`;
      zip.file(filename, blob);
    }
    
    // Generate zip file
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    // Create download link
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = timestamp ? `images_${timestamp}.zip` : 'extracted_images.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download images as zip:', error);
    alert('Failed to download images. Please try downloading individual images instead.');
  }
}

export default function Home() {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [mode, setMode] = useState<'ocr' | 'markdown' | 'merge' | 'images-to-pdf'>('ocr');
  const [imagePdfMode, setImagePdfMode] = useState<'images-to-pdf' | 'pdf-to-images'>('images-to-pdf');
  const [useCoordinates, setUseCoordinates] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [downloadLinks, setDownloadLinks] = useState<{ 
    markdown?: string; 
    pdf?: string; 
    images?: string[]; 
    count?: number; 
  }>({});
  const [darkMode, setDarkMode] = useState(false);
  const [ocrModel, setOcrModel] = useState<string>('NexaAI/DeepSeek-OCR-GGUF:BF16');
  const [joinImages, setJoinImages] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string>('');
  const [popplerInstalled, setPopplerInstalled] = useState<boolean>(true);
  const [popplerError, setPopplerError] = useState<string>('');

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Fetch available OCR models on component mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setModelsLoading(true);
        setModelsError('');
        
        const response = await fetch('/api/models');
        const data = await response.json();
        
        if (data.success) {
          setAvailableModels(data.models);
          
          // Set default model to first available one, or first one if none available
          const availableModel = data.models.find((m: ModelInfo) => m.status === 'available');
          if (availableModel) {
            setOcrModel(availableModel.id);
          } else if (data.models.length > 0) {
            setOcrModel(data.models[0].id);
          }
          
          if (!data.hasAvailableModels) {
            setModelsError(data.message || 'No OCR servers are currently running');
          }
        } else {
          setModelsError(data.error || 'Failed to fetch OCR models');
          // Fallback to hardcoded models
          setAvailableModels([
            {
              id: 'NexaAI/DeepSeek-OCR-GGUF:BF16',
              label: 'DeepSeek OCR (NexaAI) - Connection failed',
              provider: 'nexa',
              status: 'unavailable'
            }
          ]);
        }
      } catch (error: any) {
        console.error('Failed to fetch OCR models:', error);
        setModelsError('Failed to check OCR model availability');
        // Fallback to hardcoded models  
        setAvailableModels([
          {
            id: 'NexaAI/DeepSeek-OCR-GGUF:BF16',
            label: 'DeepSeek OCR (NexaAI) - Connection failed',
            provider: 'nexa',
            status: 'unavailable'
          }
        ]);
      } finally {
        setModelsLoading(false);
      }
    };

    // Check dependencies
    const checkDependencies = async () => {
      try {
        const response = await fetch('/api/dependencies');
        const data = await response.json();
        
        if (!data.allInstalled) {
          setPopplerInstalled(false);
          const missingList = data.missingDependencies.map((dep: any) => 
            `${dep.name}: ${dep.installCommand}`
          ).join('\n');
          setPopplerError(`Missing dependencies:\n${missingList}`);
        } else {
          setPopplerInstalled(true);
          setPopplerError('');
        }
      } catch (error) {
        console.error('Failed to check dependencies:', error);
        // Don't block the app if dependency check fails
        setPopplerInstalled(true);
      }
    };

    fetchModels();
    checkDependencies();
  }, []);

  // Clear files when switching modes or sub-modes
  useEffect(() => {
    setFiles([]);
    setDownloadLinks({});
  }, [mode, imagePdfMode]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  };

  const handleFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter((file) => {
      if (mode === 'ocr') {
        return file.type.startsWith('image/') || file.type === 'application/pdf';
      } else if (mode === 'markdown') {
        return file.name.endsWith('.md');
      } else if (mode === 'merge') {
        return file.type === 'application/pdf';
      } else if (mode === 'images-to-pdf') {
        // images-to-pdf mode with sub-modes
        if (imagePdfMode === 'images-to-pdf') {
          return file.type.startsWith('image/');
        } else {
          // pdf-to-images mode
          return file.type === 'application/pdf';
        }
      }
      return false;
    });

    const filesWithPreview = validFiles.map((file) => {
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      if (file.type.startsWith('image/')) {
        return { file, preview: URL.createObjectURL(file), id };
      }
      return { file, id };
    });

    setFiles((prev) => [...prev, ...filesWithPreview]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

    const processFiles = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setStatus('Uploading files...');
    setProgress(0);
    setDownloadLinks({});

    const formData = new FormData();
    files.forEach(({ file }) => {
      formData.append('files', file);
    });
    formData.append('useCoordinates', useCoordinates.toString());
    formData.append('ocrModel', ocrModel);
    formData.append('joinImages', joinImages.toString());
    
    // Add custom prompt for Ollama models
    const selectedModel = availableModels.find(m => m.id === ocrModel);
    if (selectedModel?.provider === 'ollama' && customPrompt.trim()) {
      formData.append('customPrompt', customPrompt.trim());
    }

    try {
      if (mode === 'ocr') {
        // Use streaming endpoint for OCR with progress
        const response = await fetch('/api/process-stream', {
          method: 'POST',
          body: formData,
        });

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.status === 'complete') {
                  setStatus('✓ Processing complete!');
                  setProgress(100);
                  setDownloadLinks({
                    markdown: data.markdown_url,
                    pdf: data.pdf_url,
                  });
                } else if (data.error) {
                  setStatus(`Error: ${data.error}`);
                } else {
                  setStatus(data.message || 'Processing...');
                  if (data.progress !== undefined) {
                    setProgress(data.progress);
                  }
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
        }
      } else if (mode === 'markdown') {
        // Use regular endpoint for markdown conversion
        const response = await fetch('/api/convert-markdown', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (data.success) {
          setStatus('✓ Processing complete!');
          setProgress(100);
          setDownloadLinks({
            markdown: data.markdown_url,
            pdf: data.pdf_url,
          });
        } else {
          setStatus(`Error: ${data.error}`);
        }
      } else if (mode === 'merge') {
        // Merge PDFs mode
        const response = await fetch('/api/merge-pdfs', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (data.success) {
          setStatus('✓ PDFs merged successfully!');
          setProgress(100);
          setDownloadLinks({
            pdf: data.pdf_url,
          });
        } else {
          setStatus(`Error: ${data.error}`);
        }
      } else {
        // Images/PDF mode with sub-modes
        if (imagePdfMode === 'pdf-to-images') {
          // PDF to Images mode
          const response = await fetch('/api/pdf-to-images', {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();

          if (data.success) {
            setStatus(`✓ Successfully extracted ${data.count} images!`);
            setProgress(100);
            // Store the image URLs for display
            setDownloadLinks({
              images: data.images, // Array of image URLs
              count: data.count
            });
          } else {
            // Check if it's a missing dependency error
            if (response.status === 400 && data.installCommand) {
              setPopplerInstalled(false);
              setPopplerError(data.installCommand);
              setStatus(`Error: Poppler is not installed. Please install it first.`);
            } else {
              setStatus(`Error: ${data.error}`);
            }
          }
        } else {
          // Images to PDF mode
          const response = await fetch('/api/images-to-pdf', {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();

          if (data.success) {
            setStatus('✓ PDF created successfully!');
            setProgress(100);
            setDownloadLinks({
              pdf: data.pdf_url,
            });
          } else {
            setStatus(`Error: ${data.error}`);
          }
        }
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className={`min-h-screen transition-colors duration-300 relative overflow-hidden ${
      darkMode 
        ? 'bg-[#1a1a1a]' 
        : 'bg-[#e8e3d8]'
    }`}>
      {/* Background texture */}
      <div className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 24px, ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(26, 26, 26, 0.1)'} 24px, ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(26, 26, 26, 0.1)'} 25px)`,
        }}
      />

      <div className="container mx-auto px-4 py-12 relative z-10">
        <div className="max-w-4xl mx-auto">
          {/* Dark mode toggle button */}
          <div className="absolute top-4 right-4 z-20">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-3 rounded-lg border-2 transition-all ${
                darkMode
                  ? 'bg-[#2a2a2a] border-[#444] text-[#ffd700] hover:bg-[#333]'
                  : 'bg-[#f4f1e8] border-[#d4d0c5] text-[#2d4f7c] hover:bg-[#d4d0c5]'
              }`}
              title="Toggle dark mode">
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>

          {/* Header */}
          <div className="text-center mb-12 animate-fadeInUp">
            <h1 className={`text-6xl font-bold mb-2 tracking-tight ${
              darkMode
                ? 'text-[#ffd700]'
                : 'text-[#1a1a1a]'
            }`}
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              iLovePrivacyPDF
            </h1>
            <p className={`uppercase tracking-[0.2em] text-sm font-mono ${
              darkMode
                ? 'text-[#aaa]'
                : 'text-[#2d4f7c]'
            }`}>
              AI Privacy-First Document Processing
            </p>
          </div>

          {/* Poppler dependency warning */}
          {!popplerInstalled && (
            <div className={`mb-6 p-4 border-2 rounded-lg ${
              darkMode
                ? 'bg-[#3a2a2a] border-[#d4764f] text-[#ffcccc]'
                : 'bg-[#fde8e3] border-[#d4764f] text-[#8b3a23]'
            }`}>
              <h3 className="font-bold mb-2 flex items-center gap-2">
                <span className="text-lg">⚠️</span> Missing Dependency: Poppler
              </h3>
              <p className="text-sm mb-3">
                The "PDF to Images" feature requires the Poppler library to be installed. Install it with:
              </p>
              <code className={`block p-3 rounded mb-3 font-mono text-xs overflow-x-auto ${
                darkMode
                  ? 'bg-[#2a2a2a] text-[#ffd700] border border-[#444]'
                  : 'bg-[#f4f1e8] text-[#1a1a1a] border border-[#d4d0c5]'
              }`}>
                {popplerError.includes('brew') ? 'brew install poppler' :
                 popplerError.includes('apt') ? 'sudo apt-get install poppler-utils' :
                 popplerError.includes('pacman') ? 'sudo pacman -S poppler' :
                 popplerError.includes('choco') ? 'choco install poppler' :
                 'poppler'}
              </code>
              <p className="text-xs opacity-80">
                After installation, refresh the page for changes to take effect.
              </p>
            </div>
          )}

          {/* Mode tabs */}
          <div className="flex gap-4 justify-center mb-4 flex-wrap">
            <button
              onClick={() => setMode('ocr')}
              className={`px-6 py-3 border-2 font-mono uppercase tracking-wider text-sm transition-all ${
                mode === 'ocr'
                  ? darkMode 
                    ? 'bg-[#ffd700] text-[#1a1a1a] border-[#ffd700]' 
                    : 'bg-[#1a1a1a] text-[#f4f1e8] border-[#1a1a1a]'
                  : darkMode
                    ? 'bg-[#2a2a2a] text-[#ccc] border-[#444] hover:bg-[#3a3a3a] hover:text-[#ffd700]'
                    : 'bg-[#f4f1e8] text-[#1a1a1a] border-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f4f1e8]'
              }`}>
              <span className="relative z-10">OCR Mode</span>
            </button>
            <button
              onClick={() => setMode('markdown')}
              className={`px-6 py-3 border-2 font-mono uppercase tracking-wider text-sm transition-all ${
                mode === 'markdown'
                  ? darkMode 
                    ? 'bg-[#ffd700] text-[#1a1a1a] border-[#ffd700]' 
                    : 'bg-[#1a1a1a] text-[#f4f1e8] border-[#1a1a1a]'
                  : darkMode
                    ? 'bg-[#2a2a2a] text-[#ccc] border-[#444] hover:bg-[#3a3a3a] hover:text-[#ffd700]'
                    : 'bg-[#f4f1e8] text-[#1a1a1a] border-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f4f1e8]'
              }`}>
              <span className="relative z-10">Markdown → PDF</span>
            </button>
            <button
              onClick={() => setMode('merge')}
              className={`px-6 py-3 border-2 font-mono uppercase tracking-wider text-sm transition-all ${
                mode === 'merge'
                  ? darkMode 
                    ? 'bg-[#ffd700] text-[#1a1a1a] border-[#ffd700]' 
                    : 'bg-[#1a1a1a] text-[#f4f1e8] border-[#1a1a1a]'
                  : darkMode
                    ? 'bg-[#2a2a2a] text-[#ccc] border-[#444] hover:bg-[#3a3a3a] hover:text-[#ffd700]'
                    : 'bg-[#f4f1e8] text-[#1a1a1a] border-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f4f1e8]'
              }`}>
              <span className="relative z-10">Merge PDFs</span>
            </button>
            <button
              onClick={() => setMode('images-to-pdf')}
              className={`px-6 py-3 border-2 font-mono uppercase tracking-wider text-sm transition-all ${
                mode === 'images-to-pdf'
                  ? darkMode 
                    ? 'bg-[#ffd700] text-[#1a1a1a] border-[#ffd700]' 
                    : 'bg-[#1a1a1a] text-[#f4f1e8] border-[#1a1a1a]'
                  : darkMode
                    ? 'bg-[#2a2a2a] text-[#ccc] border-[#444] hover:bg-[#3a3a3a] hover:text-[#ffd700]'
                    : 'bg-[#f4f1e8] text-[#1a1a1a] border-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f4f1e8]'
              }`}>
              <span className="relative z-10">Images ↔ PDF</span>
            </button>
          </div>

          {/* Toggles: Formatted Layout & Join Images (Side by side) */}
          {mode === 'ocr' && (
            <div className={`flex justify-center gap-3 mb-6 p-3 border-2 max-w-4xl mx-auto transition-colors ${
              darkMode
                ? 'bg-[#2a2a2a] border-[#444]'
                : 'bg-[#f4f1e8] border-[#d4d0c5]'
            }`}>
                {/* Formatted Layout Toggle */}
                <label className="flex items-center gap-2 cursor-pointer group flex-1 justify-center">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={useCoordinates}
                      onChange={(e) => setUseCoordinates(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-12 h-6 border-2 rounded-full transition-all ${
                      useCoordinates
                        ? darkMode ? 'bg-[#ffd700] border-[#ffd700]' : 'bg-[#2d4f7c] border-[#2d4f7c]'
                        : darkMode ? 'bg-[#444] border-[#666]' : 'bg-[#d4d0c5] border-[#1a1a1a]'
                    }`}>
                      <div className={`w-4 h-4 border-2 rounded-full transform transition-transform mt-0.5 ml-0.5 ${
                        useCoordinates 
                          ? `translate-x-6 ${darkMode ? 'bg-[#1a1a1a] border-[#1a1a1a]' : 'bg-white border-white'}`
                          : darkMode ? 'bg-[#ffd700] border-[#ffd700]' : 'bg-[#1a1a1a] border-[#1a1a1a]'
                      }`}></div>
                    </div>
                  </div>
                  <div className="font-mono text-xs">
                    <div className={`font-bold uppercase tracking-wider ${
                      darkMode ? 'text-[#ffd700]' : 'text-[#1a1a1a]'
                    }`}>
                      {useCoordinates ? 'Formatted' : 'Plain'}
                    </div>
                  </div>
                </label>

                {/* Join Images Toggle */}
                <label className="flex items-center gap-2 cursor-pointer group flex-1 justify-center">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={joinImages}
                      onChange={(e) => setJoinImages(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-12 h-6 border-2 rounded-full transition-all ${
                      joinImages
                        ? darkMode ? 'bg-[#ffd700] border-[#ffd700]' : 'bg-[#2d4f7c] border-[#2d4f7c]'
                        : darkMode ? 'bg-[#444] border-[#666]' : 'bg-[#d4d0c5] border-[#1a1a1a]'
                    }`}>
                      <div className={`w-4 h-4 border-2 rounded-full transform transition-transform mt-0.5 ml-0.5 ${
                        joinImages 
                          ? `translate-x-6 ${darkMode ? 'bg-[#1a1a1a] border-[#1a1a1a]' : 'bg-white border-white'}`
                          : darkMode ? 'bg-[#ffd700] border-[#ffd700]' : 'bg-[#1a1a1a] border-[#1a1a1a]'
                      }`}></div>
                    </div>
                  </div>
                  <div className="font-mono text-xs">
                    <div className={`font-bold uppercase tracking-wider ${
                      darkMode ? 'text-[#ffd700]' : 'text-[#1a1a1a]'
                    }`}>
                      🧪 Join
                    </div>
                  </div>
                </label>
              </div>
            )}

              {/* OCR Model Selection */}
              {mode === 'ocr' && (
                <>
              <div className={`flex justify-center items-center gap-4 mb-4 p-4 border-2 max-w-2xl mx-auto transition-colors ${
                darkMode
                  ? 'bg-[#2a2a2a] border-[#444]'
                  : 'bg-[#f4f1e8] border-[#d4d0c5]'
              }`}>
                <div className="font-mono text-sm flex-1">
                  <label className={`font-bold uppercase tracking-wider block mb-2 ${
                    darkMode ? 'text-[#ffd700]' : 'text-[#1a1a1a]'
                  }`}>
                    OCR Model {modelsLoading && '(Loading...)'}
                  </label>
                  
                  <select
                    value={ocrModel}
                    onChange={(e) => setOcrModel(e.target.value)}
                    disabled={modelsLoading}
                    className={`w-full px-3 py-2 border-2 font-mono text-sm transition-all ${
                      darkMode
                        ? 'bg-[#3a3a3a] text-[#ccc] border-[#666] focus:border-[#ffd700] disabled:opacity-50'
                        : 'bg-white text-[#1a1a1a] border-[#1a1a1a] focus:border-[#2d4f7c] disabled:opacity-50'
                    }`}>
                    {modelsLoading ? (
                      <option>Loading models...</option>
                    ) : (
                      availableModels.map((model) => (
                        <option 
                          key={model.id} 
                          value={model.id}
                          disabled={model.status === 'unavailable'}
                          style={{ 
                            color: model.status === 'unavailable' ? '#999' : 'inherit',
                            fontStyle: model.status === 'unavailable' ? 'italic' : 'normal'
                          }}
                        >
                          {model.label}
                        </option>
                      ))
                    )}
                  </select>
                  
                  {/* Model status and error information */}
                  <div className={`text-xs mt-1 ${darkMode ? 'text-[#999]' : 'text-[#2d4f7c]'}`}>
                    {modelsLoading ? (
                      'Checking server availability...'
                    ) : modelsError ? (
                      <span className={darkMode ? 'text-[#ff6b6b]' : 'text-[#c73e1d]'}>
                        ⚠ {modelsError}
                      </span>
                    ) : (() => {
                      const selectedModel = availableModels.find(m => m.id === ocrModel);
                      if (selectedModel) {
                        if (selectedModel.status === 'unavailable' && selectedModel.error) {
                          return (
                            <span className={darkMode ? 'text-[#ff6b6b]' : 'text-[#c73e1d]'}>
                              ⚠ {selectedModel.error}
                            </span>
                          );
                        } else if (selectedModel.status === 'available') {
                          return (
                            <span className={darkMode ? 'text-[#4dabff]' : 'text-[#2d4f7c]'}>
                              ✓ {selectedModel.provider === 'nexa' ? 'NexaAI server' : 'Ollama server'} is running
                            </span>
                          );
                        }
                      }
                      return 'Select an OCR model to process images';
                    })()}
                  </div>
                  
                  {/* Refresh button */}
                  {!modelsLoading && (
                    <button
                      onClick={async () => {
                        // Re-fetch models
                        const fetchModels = async () => {
                          try {
                            setModelsLoading(true);
                            setModelsError('');
                            
                            const response = await fetch('/api/models');
                            const data = await response.json();
                            
                            if (data.success) {
                              setAvailableModels(data.models);
                              if (!data.hasAvailableModels) {
                                setModelsError(data.message || 'No OCR servers are currently running');
                              }
                            } else {
                              setModelsError(data.error || 'Failed to fetch OCR models');
                            }
                          } catch (error) {
                            setModelsError('Failed to check OCR model availability');
                          } finally {
                            setModelsLoading(false);
                          }
                        };
                        await fetchModels();
                      }}
                      className={`mt-2 px-3 py-1 text-xs border font-mono uppercase tracking-wider transition-all ${
                        darkMode
                          ? 'bg-[#444] text-[#ccc] border-[#666] hover:bg-[#555]'
                          : 'bg-[#f0f0f0] text-[#666] border-[#ccc] hover:bg-[#e0e0e0]'
                      }`}>
                      🔄 Refresh Models
                    </button>
                  )}
                </div>
              </div>

            </>
          )}

          {/* Images/PDF Sub-mode Selection */}
          {mode === 'images-to-pdf' && (
            <div className={`flex justify-center gap-2 mb-6 p-3 border-2 max-w-lg mx-auto transition-colors ${
              darkMode
                ? 'bg-[#2a2a2a] border-[#444]'
                : 'bg-[#f4f1e8] border-[#d4d0c5]'
            }`}>
              <button
                onClick={() => setImagePdfMode('images-to-pdf')}
                className={`flex-1 px-4 py-2 border font-mono uppercase text-xs tracking-wider transition-all ${
                  imagePdfMode === 'images-to-pdf'
                    ? darkMode
                      ? 'bg-[#ffd700] text-[#1a1a1a] border-[#ffd700]'
                      : 'bg-[#1a1a1a] text-[#f4f1e8] border-[#1a1a1a]'
                    : darkMode
                      ? 'bg-[#3a3a3a] text-[#ccc] border-[#555] hover:bg-[#444]'
                      : 'bg-white text-[#666] border-[#ccc] hover:bg-[#f0f0f0]'
                }`}>
                🖼️ Images → PDF
              </button>
              <button
                onClick={() => setImagePdfMode('pdf-to-images')}
                className={`flex-1 px-4 py-2 border font-mono uppercase text-xs tracking-wider transition-all ${
                  imagePdfMode === 'pdf-to-images'
                    ? darkMode
                      ? 'bg-[#ffd700] text-[#1a1a1a] border-[#ffd700]'
                      : 'bg-[#1a1a1a] text-[#f4f1e8] border-[#1a1a1a]'
                    : darkMode
                      ? 'bg-[#3a3a3a] text-[#ccc] border-[#555] hover:bg-[#444]'
                      : 'bg-white text-[#666] border-[#ccc] hover:bg-[#f0f0f0]'
                }`}>
                📄 PDF → Images
              </button>
            </div>
          )}

          {/* Container */}
          <div className={`border-2 shadow-[0_4px_6px_rgba(0,0,0,0.1),0_10px_30px_rgba(45,79,124,0.1)] p-12 relative transition-colors ${
            darkMode
              ? 'bg-[#2a2a2a] border-[#444]'
              : 'bg-[#f4f1e8] border-[#d4d0c5]'
          }`}>
            <div className={`absolute inset-4 opacity-30 pointer-events-none ${
              darkMode
                ? 'border border-[#444]'
                : 'border border-[#d4d0c5]'
            }`} />
            
            {/* Coffee stain decorations */}
            <div className="coffee-stain absolute top-8 right-16 w-24 h-24" 
              style={{ opacity: 0.4, transform: 'rotate(45deg)' }} />
            <div className="coffee-stain absolute bottom-12 left-20 w-16 h-16" 
              style={{ opacity: 0.3, transform: 'rotate(-30deg)' }} />
            <div className="coffee-stain absolute top-32 right-1/3 w-12 h-12" 
              style={{ opacity: 0.25, transform: 'rotate(120deg)' }} />

            {/* OCR Server Warning */}
            {mode === 'ocr' && !modelsLoading && !availableModels.some(m => m.status === 'available') && (
              <div className={`mb-6 p-4 border-2 rounded font-mono text-sm ${
                darkMode
                  ? 'bg-[rgba(255,215,0,0.1)] border-[#ffd700] text-[#ffd700]'
                  : 'bg-[rgba(255,165,0,0.1)] border-[#ff8c00] text-[#d4731a]'
              }`}>
                <div className="mb-2"><strong>⚠ No OCR servers detected</strong></div>
                <div className="text-xs space-y-1">
                  <div>• Start NexaAI: <code>nexa serve --host 127.0.0.1:18181</code></div>
                  <div>• Start Ollama: <code>ollama serve</code> (then pull vision models)</div>
                  <div>• Use the "🔄 Refresh Models" button after starting servers</div>
                </div>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById('fileInput')?.click()}
              className={`border-3 border-dashed p-16 text-center cursor-pointer transition-all relative overflow-hidden ${
                darkMode
                  ? 'border-[#ffd700] bg-[rgba(255,215,0,0.05)] hover:bg-[rgba(255,215,0,0.1)]'
                  : 'border-[#2d4f7c] hover:bg-[rgba(199,62,29,0.05)] hover:border-[#c73e1d]'
              }`}>
              <div className="relative z-10">
                {mode === 'ocr' ? (
                  <ImageIcon className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-[#ffd700]' : 'text-[#2d4f7c]'}`} />
                ) : mode === 'markdown' ? (
                  <FileText className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-[#ffd700]' : 'text-[#2d4f7c]'}`} />
                ) : mode === 'merge' ? (
                  <File className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-[#ffd700]' : 'text-[#2d4f7c]'}`} />
                ) : mode === 'images-to-pdf' ? (
                  imagePdfMode === 'pdf-to-images' ? (
                    <File className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-[#ffd700]' : 'text-[#2d4f7c]'}`} />
                  ) : (
                    <ImageIcon className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-[#ffd700]' : 'text-[#2d4f7c]'}`} />
                  )
                ) : (
                  <ImageIcon className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-[#ffd700]' : 'text-[#2d4f7c]'}`} />
                )}
                <p className={`text-xl font-semibold mb-2 ${darkMode ? 'text-[#eee]' : 'text-[#1a1a1a]'}`}>
                  {mode === 'ocr' 
                    ? 'Drop images or PDF here' 
                    : mode === 'markdown' 
                    ? 'Drop markdown file here' 
                    : mode === 'merge'
                    ? 'Drop PDF files here'
                    : mode === 'images-to-pdf'
                    ? (imagePdfMode === 'pdf-to-images' 
                      ? 'Drop PDF files here' 
                      : 'Drop images here')
                    : 'Drop images here'}
                </p>
                <p className={`text-sm font-mono ${darkMode ? 'text-[#aaa]' : 'text-[#2d4f7c]'}`}>
                  {mode === 'merge' || mode === 'images-to-pdf' ? 'Drag to reorder • ' : ''}Or click to browse
                </p>
              </div>
              <input
                id="fileInput"
                type="file"
                multiple={mode !== 'markdown'}
                accept={
                  mode === 'ocr' 
                    ? 'image/*,application/pdf' 
                    : mode === 'markdown' 
                    ? '.md,.markdown' 
                    : mode === 'merge' 
                    ? 'application/pdf' 
                    : mode === 'images-to-pdf'
                    ? (imagePdfMode === 'pdf-to-images' ? 'application/pdf' : 'image/*')
                    : 'image/*'
                }
                onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))}
                className="hidden"
              />
            </div>

            {/* File preview with drag & drop reordering */}
            {files.length > 0 && (
              <div className={`mt-6 max-h-80 overflow-y-auto border-2 p-4 transition-colors ${
                darkMode
                  ? 'border-[#444] bg-[rgba(255,255,255,0.05)]'
                  : 'border-[#d4d0c5] bg-[rgba(255,255,255,0.4)]'
              }`}>
                {/* Show warning if join images is enabled and there are more than 10 images */}
                {mode === 'ocr' && joinImages && files.length > 10 && (
                  <div className={`mb-4 p-3 border rounded font-mono text-sm ${
                    darkMode
                      ? 'bg-[rgba(255,215,0,0.1)] border-[#ffd700] text-[#ffd700]'
                      : 'bg-[rgba(255,165,0,0.1)] border-[#ff8c00] text-[#d4731a]'
                  }`}>
                    ⚠ With "Join Images" enabled, only the best 10 images will be selected for processing.
                    Long/tall images will be prioritized for better OCR results.
                  </div>
                )}
                
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}>
                  <SortableContext
                    items={files.map((f) => f.id)}
                    strategy={verticalListSortingStrategy}>
                    {files.map((item, index) => (
                      <SortableFileItem
                        key={item.id}
                        item={item}
                        index={index}
                        onRemove={removeFile}
                        darkMode={darkMode}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {/* Custom Prompt for Ollama models */}
            {mode === 'ocr' && (() => {
              const selectedModel = availableModels.find(m => m.id === ocrModel);
              return selectedModel?.provider === 'ollama';
            })() && (
              <div className={`mt-6 p-4 border-2 transition-colors ${
                darkMode
                  ? 'border-[#444] bg-[rgba(255,255,255,0.05)]'
                  : 'border-[#d4d0c5] bg-[rgba(255,255,255,0.4)]'
              }`}>
                <label className={`font-mono text-sm font-bold uppercase tracking-wider block mb-2 ${
                  darkMode ? 'text-[#ccc]' : 'text-[#1a1a1a]'
                }`}>
                  Custom Prompt (Optional)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Add custom instructions for the Ollama model (e.g., 'Extract text and preserve formatting', 'Focus on tables and numbers', etc.)"
                  rows={3}
                  className={`w-full px-3 py-2 border-2 font-mono text-sm transition-all resize-none ${
                    darkMode
                      ? 'bg-[#1a1a1a] text-[#ccc] border-[#444] focus:border-[#ffd700] placeholder-[#666]'
                      : 'bg-white text-[#1a1a1a] border-[#1a1a1a] focus:border-[#2d4f7c] placeholder-[#999]'
                  }`}
                />
                <div className={`text-xs mt-1 font-mono ${
                  darkMode ? 'text-[#999]' : 'text-[#666]'
                }`}>
                  💡 This prompt will be sent to the Ollama model along with the image
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-4 mt-8">
              <button
                onClick={processFiles}
                disabled={
                  files.length === 0 || 
                  processing || 
                  modelsLoading || 
                  (mode === 'ocr' && !availableModels.some(m => m.status === 'available'))
                }
                className={`flex-1 px-8 py-4 border-3 font-mono uppercase tracking-wider shadow-[4px_4px_0_rgba(0,0,0,0.2)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_rgba(0,0,0,0.3)] disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                  darkMode
                    ? 'bg-[#ffd700] text-[#1a1a1a] border-[#ffd700] hover:bg-[#ff8c00]'
                    : 'bg-[#c73e1d] text-[#f4f1e8] border-[#1a1a1a] hover:bg-[#1a1a1a]'
                }`}>
                {processing 
                  ? 'Processing...' 
                  : modelsLoading 
                  ? 'Loading Models...'
                  : mode === 'merge' 
                  ? 'Merge PDFs' 
                  : mode === 'images-to-pdf'
                  ? (imagePdfMode === 'pdf-to-images' ? 'Extract Images' : 'Create PDF')
                  : 'Process Files'}
              </button>
              <button
                onClick={() => {
                  setFiles([]);
                  setStatus('');
                  setProgress(0);
                  setDownloadLinks({});
                }}
                className={`flex-1 px-8 py-4 border-3 font-mono uppercase tracking-wider shadow-[4px_4px_0_rgba(0,0,0,0.2)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_rgba(0,0,0,0.3)] transition-all ${
                  darkMode
                    ? 'bg-[#2a2a2a] text-[#ccc] border-[#666] hover:bg-[#c73e1d] hover:text-[#f4f1e8]'
                    : 'bg-[#f4f1e8] text-[#1a1a1a] border-[#1a1a1a] hover:bg-[#d4af37]'
                }`}>
                Clear All
              </button>
            </div>

            {/* Status */}
            {status && (
              <div
                className={`mt-6 p-4 border-2 font-mono transition-colors ${
                  status.includes('Error')
                    ? darkMode
                      ? 'bg-[rgba(199,62,29,0.2)] border-[#ff6b6b] text-[#ff6b6b]'
                      : 'bg-[rgba(199,62,29,0.1)] border-[#c73e1d] text-[#c73e1d]'
                    : status.includes('Processing') || processing
                    ? darkMode
                      ? 'bg-[rgba(255,215,0,0.15)] border-[#ffd700] text-[#ffd700]'
                      : 'bg-[rgba(212,175,55,0.15)] border-[#d4af37] text-[#1a1a1a]'
                    : darkMode
                    ? 'bg-[rgba(100,200,255,0.15)] border-[#4dabff] text-[#4dabff]'
                    : 'bg-[rgba(45,79,124,0.1)] border-[#2d4f7c] text-[#2d4f7c]'
                }`}>
                <div className={`text-center mb-3 ${darkMode && status.includes('Processing') ? 'text-[#ffd700]' : ''}`}>{status}</div>
                
                {/* Simple progress bar */}
                {processing && progress > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-xs uppercase tracking-wider ${darkMode ? 'text-[#999]' : 'text-[#2d4f7c]'}`}>Progress</span>
                      <span className={`text-lg font-bold tabular-nums ${darkMode ? 'text-[#ffd700]' : ''}`}>{progress}%</span>
                    </div>
                    <div className={`h-3 border-2 ${
                      darkMode
                        ? 'bg-[#444] border-[#666]'
                        : 'bg-[#d4d0c5] border-[#1a1a1a]'
                    }`}>
                      <div 
                        className={`h-full transition-all duration-300 ${
                          darkMode
                            ? 'bg-[#ffd700]'
                            : 'bg-[#2d4f7c]'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Download links for OCR/Markdown modes */}
                {downloadLinks.markdown && (
                  <div className="flex gap-3 justify-center mt-4">
                    <a
                      href={downloadLinks.markdown}
                      download
                      className={`px-6 py-2 font-mono uppercase text-sm tracking-wider border-2 shadow-[3px_3px_0_rgba(0,0,0,0.2)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[5px_5px_0_rgba(0,0,0,0.3)] transition-all ${
                        darkMode
                          ? 'bg-[#ffd700] text-[#1a1a1a] border-[#ffd700] hover:bg-[#ff8c00]'
                          : 'bg-[#1a1a1a] text-[#f4f1e8] border-[#1a1a1a] hover:bg-[#c73e1d]'
                      }`}>
                      Download Markdown
                    </a>
                    {downloadLinks.pdf && (
                      <a
                        href={downloadLinks.pdf}
                        download
                        className={`px-6 py-2 font-mono uppercase text-sm tracking-wider border-2 shadow-[3px_3px_0_rgba(0,0,0,0.2)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[5px_5px_0_rgba(0,0,0,0.3)] transition-all ${
                          darkMode
                            ? 'bg-[#ffd700] text-[#1a1a1a] border-[#ffd700] hover:bg-[#ff8c00]'
                            : 'bg-[#1a1a1a] text-[#f4f1e8] border-[#1a1a1a] hover:bg-[#c73e1d]'
                        }`}>
                        Download PDF
                      </a>
                    )}
                  </div>
                )}

                {/* Single PDF download for other modes */}
                {downloadLinks.pdf && !downloadLinks.markdown && (
                  <div className="flex justify-center mt-4">
                    <a
                      href={downloadLinks.pdf}
                      download
                      className={`px-6 py-2 font-mono uppercase text-sm tracking-wider border-2 shadow-[3px_3px_0_rgba(0,0,0,0.2)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[5px_5px_0_rgba(0,0,0,0.3)] transition-all ${
                        darkMode
                          ? 'bg-[#ffd700] text-[#1a1a1a] border-[#ffd700] hover:bg-[#ff8c00]'
                          : 'bg-[#1a1a1a] text-[#f4f1e8] border-[#1a1a1a] hover:bg-[#c73e1d]'
                      }`}>
                      Download PDF
                    </a>
                  </div>
                )}

                {/* Image gallery for PDF-to-images mode */}
                {downloadLinks.images && downloadLinks.images.length > 0 && (
                  <div className="mt-4">
                    <div className={`text-center mb-3 text-sm font-mono ${darkMode ? 'text-[#ccc]' : 'text-[#666]'}`}>
                      Extracted {downloadLinks.count} images - Right-click to save individual images
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                      {downloadLinks.images.map((imageUrl, index) => (
                        <ImageThumbnail
                          key={index}
                          imageUrl={imageUrl}
                          pageNumber={index + 1}
                          darkMode={darkMode}
                        />
                      ))}
                    </div>
                    
                    {/* Download All button */}
                    <div className="flex justify-center mt-4">
                      <button
                        onClick={() => {
                          if (downloadLinks.images && downloadLinks.images.length > 0) {
                            const timestamp = new Date().toISOString().replace(/:/g, '-').substring(0, 19);
                            downloadAllImages(downloadLinks.images, timestamp);
                          }
                        }}
                        className={`px-6 py-2 font-mono uppercase text-sm tracking-wider border-2 shadow-[3px_3px_0_rgba(0,0,0,0.2)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[5px_5px_0_rgba(0,0,0,0.3)] transition-all ${
                          darkMode
                            ? 'bg-[#ffd700] text-[#1a1a1a] border-[#ffd700] hover:bg-[#ff8c00]'
                            : 'bg-[#1a1a1a] text-[#f4f1e8] border-[#1a1a1a] hover:bg-[#c73e1d]'
                        }`}>
                        Download All Images (ZIP)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
