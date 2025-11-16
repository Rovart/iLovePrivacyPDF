use anyhow::{Context, Result};
use base64::{engine::general_purpose, Engine as _};
use clap::{Parser, Subcommand};
use pdf_extract::extract_text;
use printpdf::{IndirectFontRef, Line, Mm, PdfLayerReference, Point};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Parser)]
#[command(name = "ocr_processor")]
#[command(about = "OCR processor for images and PDFs", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Process a single image file
    ProcessImage {
        /// Path to the image file
        #[arg(short, long)]
        input: PathBuf,

        /// Output markdown file path
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// OCR model to use
        #[arg(short, long, default_value = "NexaAI/DeepSeek-OCR-GGUF:BF16")]
        model: String,

        /// Custom prompt for Ollama models (optional)
        #[arg(long)]
        custom_prompt: Option<String>,

        /// Use coordinates in OCR output
        #[arg(long)]
        use_coordinates: bool,
    },

    /// Process multiple images in a directory
    ProcessDir {
        /// Directory containing images
        #[arg(short, long)]
        input: PathBuf,

        /// Output markdown file path
        #[arg(short, long)]
        output: PathBuf,

        /// OCR model to use
        #[arg(short, long, default_value = "NexaAI/DeepSeek-OCR-GGUF:BF16")]
        model: String,

        /// Join all images into one before OCR (experimental)
        #[arg(long)]
        join_images: bool,

        /// Custom prompt for Ollama models (optional)
        #[arg(long)]
        custom_prompt: Option<String>,

        /// Use coordinates in OCR output
        #[arg(long)]
        use_coordinates: bool,
    },
    /// Extract images from PDF and process
    ProcessPdf {
        /// Path to the PDF file
        #[arg(short, long)]
        input: PathBuf,

        /// Output markdown file path
        #[arg(short, long)]
        output: PathBuf,

        /// Temporary directory for extracted images
        #[arg(short, long, default_value = "temp_images")]
        temp_dir: PathBuf,
        /// Use native rust extraction (fallback when pdftoppm is not available)
        #[arg(long)]
        use_native: bool,
    },
    /// Convert markdown to PDF
    MarkdownToPdf {
        /// Input markdown file
        #[arg(short, long)]
        input: PathBuf,

        /// Output PDF file
        #[arg(short, long)]
        output: PathBuf,

        /// Use coordinate-based formatting (preserves original layout)
        #[arg(long)]
        use_coordinates: bool,
    },
    /// Process markdown (clean and display)
    ProcessMarkdown {
        /// Input markdown file
        #[arg(short, long)]
        input: PathBuf,

        /// Output markdown file (optional, if not provided prints to stdout)
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Remove OCR coordinates and internal markers for clean output
        #[arg(long)]
        clean: bool,
    },
}

#[derive(Serialize)]
struct OcrRequest {
    model: String,
    messages: Vec<Message>,
    max_tokens: u32,
    stream: bool,
}

#[derive(Serialize)]
struct Message {
    role: String,
    content: Vec<Content>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum Content {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrl },
}

#[derive(Serialize)]
struct ImageUrl {
    url: String,
}

#[derive(Deserialize)]
struct OcrResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Deserialize)]
struct ResponseMessage {
    content: String,
}

const NEXA_API_URL: &str = "http://127.0.0.1:18181/v1/chat/completions";
const OLLAMA_API_URL: &str = "http://127.0.0.1:11434/v1/chat/completions";

// Determine which API to use based on model name
fn get_api_url(model: &str) -> &'static str {
    // Check if it's an Ollama model (doesn't contain "NexaAI" or "GGUF")
    if model.contains("NexaAI") || model.contains("GGUF") {
        NEXA_API_URL
    } else {
        OLLAMA_API_URL
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match &cli.command {
        Commands::ProcessImage { input, output, model, custom_prompt, use_coordinates } => {
            let markdown = process_image(input, model, custom_prompt.as_deref(), *use_coordinates).await?;

            if let Some(output_path) = output {
                fs::write(output_path, &markdown)?;
                println!("✓ Markdown saved to: {}", output_path.display());
            } else {
                println!("{}", markdown);
            }
        }
        Commands::ProcessDir { input, output, model, join_images, custom_prompt, use_coordinates } => {
            let markdown = if *join_images {
                process_directory_joined(input, model, custom_prompt.as_deref(), *use_coordinates).await?
            } else {
                process_directory(input, model, custom_prompt.as_deref(), *use_coordinates).await?
            };
            fs::write(output, &markdown)?;
            println!("✓ Markdown saved to: {}", output.display());
        }
        Commands::ProcessPdf {
            input,
            output,
            temp_dir,
            use_native,
        } => {
            let markdown = process_pdf(input, temp_dir, *use_native).await?;
            fs::write(output, &markdown)?;
            println!("✓ Markdown saved to: {}", output.display());
        }
        Commands::MarkdownToPdf {
            input,
            output,
            use_coordinates,
        } => {
            println!(
                "👉 markdown-to-pdf: input={} output={} use_coordinates={}",
                input.display(),
                output.display(),
                use_coordinates
            );
            let markdown = fs::read_to_string(input)?;
            convert_markdown_to_pdf(&markdown, output, *use_coordinates)?;
            println!("✓ PDF saved to: {}", output.display());
        }
        Commands::ProcessMarkdown { input, output, clean } => {
            let markdown = fs::read_to_string(input)?;
            let processed = if *clean {
                clean_markdown_for_plain(&markdown)
            } else {
                markdown
            };
            
            if let Some(output_path) = output {
                fs::write(output_path, &processed)?;
                println!("✓ Markdown saved to: {}", output_path.display());
            } else {
                println!("{}", processed);
            }
        }
    }

    Ok(())
}

async fn process_image(image_path: &Path, model: &str, custom_prompt: Option<&str>, use_coordinates: bool) -> Result<String> {
    let filename = image_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image");

    println!("Processing: {}", filename);

    // Read and encode image to base64
    let image_data =
        fs::read(image_path).context(format!("Failed to read image: {}", image_path.display()))?;
    let base64_image = general_purpose::STANDARD.encode(&image_data);

    // Detect if this is an Ollama model (doesn't contain "NexaAI" or "GGUF")
    let is_ollama = !model.contains("NexaAI") && !model.contains("GGUF");

    // Build the base prompt text
    let base_prompt = if let Some(custom) = custom_prompt {
        format!("{} <|grounding|>{}", filename, custom)
    } else {
        format!("{} <|grounding|>Convert the document to markdown.", filename)
    };

    // Add automatic instructions for Ollama models
    let prompt_text = if is_ollama {
        let mut enhanced = base_prompt;
        enhanced.push_str("\n\nIMPORTANT INSTRUCTIONS:");
        enhanced.push_str("\n- Return ONLY the OCR result. No thinking, explanations, or markdown code blocks.");
        enhanced.push_str("\n- Fix grammar mistakes when confident.");
        if use_coordinates {
            enhanced.push_str("\n- Include coordinate information for text positioning.");
        }
        enhanced
    } else {
        base_prompt
    };

    // Prepare OCR request
    let request = OcrRequest {
        model: model.to_string(),
        messages: vec![Message {
            role: "user".to_string(),
            content: vec![
                Content::Text {
                    text: prompt_text,
                },
                Content::ImageUrl {
                    image_url: ImageUrl {
                        url: format!("data:image/png;base64,{}", base64_image),
                    },
                },
            ],
        }],
        max_tokens: 16384,
        stream: false,
    };

    // Send request to OCR API
    let api_url = get_api_url(model);
    println!("Using API: {} with model: {}", api_url, model);
    
    let client = reqwest::Client::new();
    let response = client
        .post(api_url)
        .json(&request)
        .send()
        .await
        .context("Failed to send OCR request")?;

    if !response.status().is_success() {
        anyhow::bail!(
            "OCR API error: {} - {}",
            response.status(),
            response.text().await?
        );
    }

    let ocr_response: OcrResponse = response.json().await?;
    let markdown = ocr_response
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .unwrap_or_default();

    Ok(clean_markdown(&markdown))
}

async fn process_directory(dir_path: &Path, model: &str, custom_prompt: Option<&str>, use_coordinates: bool) -> Result<String> {
    let mut image_files: Vec<PathBuf> = WalkDir::new(dir_path)
        .max_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|ext| matches!(ext.to_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp"))
                .unwrap_or(false)
        })
        .map(|e| e.path().to_path_buf())
        .collect();

    image_files.sort();

    let total = image_files.len();
    let mut combined_markdown = String::new();

    println!("📊 Processing {} images", total);
    println!("─────────────────────────────────────────");

    for (i, image_path) in image_files.iter().enumerate() {
        let current = i + 1;
        let percentage = (current as f32 / total as f32 * 100.0) as u32;

        // Simple per-image progress log (no animation)
        println!("[{}/{}] {}% | Processing: {}", current, total, percentage, image_path.display());

        let markdown = process_image(image_path, model, custom_prompt, use_coordinates).await?;
        
        // Add image index marker before the content
        combined_markdown.push_str(&format!("---IMAGE_INDEX:{}---\n", i));
        combined_markdown.push_str(&markdown);
        combined_markdown.push_str("\n\n");
        
        // Add explicit page break marker between images (except after last one)
        if current < total {
            combined_markdown.push_str("---PAGE_BREAK---\n\n");
        }
    }

    println!("\n✓ All images processed successfully!");

    Ok(combined_markdown)
}

async fn process_directory_joined(dir_path: &Path, model: &str, custom_prompt: Option<&str>, use_coordinates: bool) -> Result<String> {
    use image::{DynamicImage, ImageBuffer, Rgba};
    
    let mut image_files: Vec<PathBuf> = WalkDir::new(dir_path)
        .max_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|ext| matches!(ext.to_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp"))
                .unwrap_or(false)
        })
        .map(|e| e.path().to_path_buf())
        .collect();

    image_files.sort();

    let total = image_files.len();
    
    if total == 0 {
        anyhow::bail!("No images found in directory");
    }

    const MAX_IMAGES_TO_JOIN: usize = 10;
    
    println!("🧪 Experimental: Joining images into one");
    
    if total > MAX_IMAGES_TO_JOIN {
        println!("⚠ Warning: Found {} images, but limiting to {} for performance", total, MAX_IMAGES_TO_JOIN);
        
        // Prioritize long/tall images for better OCR results
        let mut image_info: Vec<(PathBuf, (u32, u32))> = Vec::new();
        
        // Load image dimensions for sorting
        for image_path in &image_files {
            if let Ok(dimensions) = image::image_dimensions(image_path) {
                image_info.push((image_path.clone(), dimensions));
            } else {
                // If we can't get dimensions, add with default priority
                image_info.push((image_path.clone(), (1000, 1000)));
            }
        }
        
        // Sort by aspect ratio (height/width) to prioritize tall images, then by total area
        image_info.sort_by(|a, b| {
            let aspect_a = a.1.1 as f32 / a.1.0 as f32; // height/width
            let aspect_b = b.1.1 as f32 / b.1.0 as f32;
            let area_a = a.1.0 * a.1.1;
            let area_b = b.1.0 * b.1.1;
            
            // First prioritize by aspect ratio (taller images first)
            match aspect_b.partial_cmp(&aspect_a).unwrap_or(std::cmp::Ordering::Equal) {
                std::cmp::Ordering::Equal => area_b.cmp(&area_a), // Then by area
                other => other,
            }
        });
        
        // Take only the top MAX_IMAGES_TO_JOIN images
        image_files = image_info.into_iter()
            .take(MAX_IMAGES_TO_JOIN)
            .map(|(path, _)| path)
            .collect();
        
        println!("✓ Selected {} best images for joining (prioritizing tall/long images)", MAX_IMAGES_TO_JOIN);
    }
    
    println!("📊 Processing {} images", image_files.len());
    println!("─────────────────────────────────────────");

    // Load all images
    let mut images: Vec<DynamicImage> = Vec::new();
    let mut max_width = 0u32;
    let mut total_height = 0u32;

    for (i, image_path) in image_files.iter().enumerate() {
        println!("[{}/{}] Loading: {}", i + 1, total, image_path.display());
        
        let img = image::open(image_path)
            .context(format!("Failed to open image: {}", image_path.display()))?;
        
        max_width = max_width.max(img.width());
        total_height += img.height();
        images.push(img);
    }

    println!("✓ All images loaded");
    println!("📐 Creating combined image: {}x{} pixels", max_width, total_height);

    // Create a new image that can hold all images vertically
    let mut combined = ImageBuffer::from_pixel(max_width, total_height, Rgba([255u8, 255u8, 255u8, 255u8]));
    
    let mut current_y = 0u32;
    for (i, img) in images.iter().enumerate() {
        println!("[{}/{}] Copying image to combined canvas", i + 1, total);
        
        // Convert to RGBA if needed
        let rgba_img = img.to_rgba8();
        
        // Center the image horizontally if it's narrower than max_width
        let x_offset = (max_width - img.width()) / 2;
        
        // Copy pixels from source image to combined image
        for y in 0..img.height() {
            for x in 0..img.width() {
                let pixel = rgba_img.get_pixel(x, y);
                combined.put_pixel(x + x_offset, current_y + y, *pixel);
            }
        }
        
        current_y += img.height();
    }

    println!("✓ Combined image created");
    println!("📤 Encoding to base64...");

    // Save combined image to memory buffer
    let mut buffer = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buffer);
    combined.write_to(&mut cursor, image::ImageFormat::Png)
        .context("Failed to encode combined image")?;
    
    let base64_image = general_purpose::STANDARD.encode(&buffer);

    println!("✓ Image encoded ({} bytes)", buffer.len());
    println!("🔍 Sending to OCR API...");

    // Detect if this is an Ollama model (doesn't contain "NexaAI" or "GGUF")
    let is_ollama = !model.contains("NexaAI") && !model.contains("GGUF");

    // Build the base prompt text with custom prompt if provided
    let base_prompt = if let Some(custom) = custom_prompt {
        format!("Combined document with multiple pages. <|grounding|>{}", custom)
    } else {
        "Combined document with multiple pages. <|grounding|>Convert the entire document to markdown, preserving the structure and content from all pages.".to_string()
    };

    // Add automatic instructions for Ollama models
    let prompt_text = if is_ollama {
        let mut enhanced = base_prompt;
        enhanced.push_str("\n\nIMPORTANT INSTRUCTIONS:");
        enhanced.push_str("\n- Extract all text from this image. Present the extracted text in a structured format, preserving all line breaks and original spacing. Do not interpret or summarize the content; provide the raw text as precisely as possible.");
        enhanced.push_str("\n- Fix grammar mistakes when confident.");
        if use_coordinates {
            enhanced.push_str("\n- Include coordinate information for text positioning.");
        }
        enhanced
    } else {
        base_prompt
    };

    // Prepare OCR request with combined image
    let request = OcrRequest {
        model: model.to_string(),
        messages: vec![Message {
            role: "user".to_string(),
            content: vec![
                Content::Text {
                    text: prompt_text,
                },
                Content::ImageUrl {
                    image_url: ImageUrl {
                        url: format!("data:image/png;base64,{}", base64_image),
                    },
                },
            ],
        }],
        max_tokens: 16384,
        stream: false,
    };

    // Send request to OCR API
    let api_url = get_api_url(model);
    println!("Using API: {} with model: {}", api_url, model);
    
    let client = reqwest::Client::new();
    let response = client
        .post(api_url)
        .json(&request)
        .send()
        .await
        .context("Failed to send OCR request")?;

    if !response.status().is_success() {
        anyhow::bail!(
            "OCR API error: {} - {}",
            response.status(),
            response.text().await?
        );
    }

    let ocr_response: OcrResponse = response.json().await?;
    let markdown = ocr_response
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .unwrap_or_default();

    println!("✓ OCR completed successfully!");

    Ok(clean_markdown(&markdown))
}

async fn process_pdf(pdf_path: &Path, temp_dir: &Path, use_native: bool) -> Result<String> {
    // PDF processing uses default model
    const DEFAULT_MODEL: &str = "NexaAI/DeepSeek-OCR-GGUF:BF16";
    
    // Create temp directory
    fs::create_dir_all(temp_dir)?;

    println!("📄 Extracting pages from PDF using pdftoppm...");

    // Use pdftoppm to extract PDF pages as PNG images
    let output_prefix = temp_dir.join("page");
    let output_prefix_str = output_prefix
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("Invalid output path"))?;

    // Run pdftoppm command
    let output = std::process::Command::new("pdftoppm")
        .arg("-png")
        .arg("-r")
        .arg("300") // 300 DPI for good quality
        .arg(pdf_path)
        .arg(output_prefix_str)
        .output();

    match output {
        Ok(result) if result.status.success() => {
            println!("✓ PDF pages extracted successfully");
        }
        Ok(result) => {
            let error = String::from_utf8_lossy(&result.stderr);
            anyhow::bail!("pdftoppm failed: {}", error);
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // If requested to use native extraction, fallback to Rust extraction instead of error
            if use_native {
                println!("⚠ pdftoppm not found. Falling back to native PDF extraction using pdf-extract crate.");
                return process_pdf_native(pdf_path).await;
            }
            anyhow::bail!(
                "pdftoppm not found. Please install poppler-utils:\n  \
                 macOS: brew install poppler\n  \
                 Ubuntu/Debian: sudo apt-get install poppler-utils"
            );
        }
        Err(e) => {
            anyhow::bail!("Failed to run pdftoppm: {}", e);
        }
    }

    // Process extracted images
    process_directory(temp_dir, DEFAULT_MODEL, None, false).await
}

async fn process_pdf_native(pdf_path: &Path) -> Result<String> {
    // Use the pdf-extract crate to extract text directly from PDF as a fallback when pdftoppm is not available.
    println!("📄 Extracting text from PDF using pdf-extract (native fallback)...");
    let text_result = extract_text(pdf_path)
        .with_context(|| format!("Failed to extract PDF text for {}", pdf_path.display()))?;
    // Return the extracted text as markdown.
    println!("✓ Native PDF extraction successful");
    Ok(text_result)
}

fn clean_markdown(text: &str) -> String {
    // Remove OCR-specific tags but KEEP <|det|> tags for coordinate-based rendering
    // Remove all <|ref|>...<|/ref|> tags (including newlines within)
    let re_ref = Regex::new(r"(?s)<\|ref\|>.*?<\|/ref\|>").unwrap();
    // Remove specific OCR tags line by line, but keep det tags
    // Match common OCR tags: <|grounding|>, <|think|>, <|OCR|>, etc.
    let re_grounding = Regex::new(r"(?m)^<\|grounding\|>.*$").unwrap();
    let re_think = Regex::new(r"(?m)^<\|think\|>.*$").unwrap();
    let re_ocr = Regex::new(r"(?m)^<\|OCR\|>.*$").unwrap();
    // Remove multiple consecutive newlines (3 or more)
    let re_newlines = Regex::new(r"\n{3,}").unwrap();
    // Remove lines with just spaces/tabs
    let re_empty = Regex::new(r"(?m)^[ \t]+$").unwrap();

    let mut cleaned = text.to_string();

    // Apply OCR tag removal but preserve <|det|> tags
    cleaned = re_ref.replace_all(&cleaned, "").to_string();
    cleaned = re_grounding.replace_all(&cleaned, "").to_string();
    cleaned = re_think.replace_all(&cleaned, "").to_string();
    cleaned = re_ocr.replace_all(&cleaned, "").to_string();
    cleaned = re_empty.replace_all(&cleaned, "").to_string();
    cleaned = re_newlines.replace_all(&cleaned, "\n\n").to_string();

    // Remove explicit markers used internally
    let re_page_break = Regex::new(r"(?m)^---PAGE_BREAK---\s*$").unwrap();
    let re_image_index = Regex::new(r"(?m)^---IMAGE_INDEX:.*---\s*$").unwrap();
    cleaned = re_page_break.replace_all(&cleaned, "").to_string();
    cleaned = re_image_index.replace_all(&cleaned, "").to_string();

    cleaned.trim().to_string()
}

fn clean_markdown_for_plain(text: &str) -> String {
    // Remove ALL OCR tags including <|det|> for plain text mode
    let re_all_tags = Regex::new(r"(?m)^<\|[^|]+\|>.*$").unwrap();
    let re_det_tags = Regex::new(r"<\|det\|>.*?<\|/det\|>").unwrap();
    let re_ref = Regex::new(r"(?s)<\|ref\|>.*?<\|/ref\|>").unwrap();
    let re_newlines = Regex::new(r"\n{3,}").unwrap();
    let re_empty = Regex::new(r"(?m)^[ \t]+$").unwrap();
    let re_page_break = Regex::new(r"(?m)^---PAGE_BREAK---\s*$").unwrap();
    let re_image_index = Regex::new(r"(?m)^---IMAGE_INDEX:\d+---\s*$").unwrap();

    let mut cleaned = text.to_string();

    // Remove all OCR tags including det tags
    cleaned = re_det_tags.replace_all(&cleaned, "").to_string();
    cleaned = re_ref.replace_all(&cleaned, "").to_string();
    cleaned = re_all_tags.replace_all(&cleaned, "").to_string();
    cleaned = re_page_break.replace_all(&cleaned, "").to_string();
    cleaned = re_image_index.replace_all(&cleaned, "").to_string();
    cleaned = re_empty.replace_all(&cleaned, "").to_string();
    cleaned = re_newlines.replace_all(&cleaned, "\n\n").to_string();

    cleaned.trim().to_string()
}


fn is_list_item(text: &str) -> bool {
    let trimmed = text.trim_start();
    // Check for explicit list markers ONLY
    // Checkbox marker
    if trimmed.starts_with("☐ ") {
        return true;
    }
    // Bullet point marker
    if trimmed.starts_with("• ") {
        return true;
    }
    // Asterisk marker - MUST be at start followed by space
    if trimmed.starts_with("* ") && !trimmed.starts_with("* *") {
        return true;
    }
    // Dash marker - MUST be at start followed by space, NOT part of normal text
    if trimmed.starts_with("- ") && trimmed.len() > 2 {
        // Check that it's not just a dash separator (multiple dashes)
        if !trimmed.starts_with("---") {
            return true;
        }
    }
    // Numeric list: "1. " or "1) " at start
    if trimmed.len() > 2 {
        if let Some(first_char) = trimmed.chars().next() {
            if first_char.is_numeric() {
                if let Some(second_char) = trimmed.chars().nth(1) {
                    if (second_char == '.' || second_char == ')') {
                        if let Some(third_char) = trimmed.chars().nth(2) {
                            if third_char.is_whitespace() {
                                return true;
                            }
                        }
                    }
                }
            }
        }
    }
    
    false
}

fn get_list_indent() -> f32 {
    4.0  // mm indent for list items
}

fn split_list_items(text: &str) -> Vec<String> {
    // Split a block that may contain multiple list items into separate items.
    // Handles markers: ☐, •, -, *, numbered like "1." or "1)".
    let mut items: Vec<String> = Vec::new();
    let trimmed = text.trim();
    // If the line starts with a marker, try to split by occurrences of markers
    let markers = vec!["☐ ", "• ", "- ", "* "]; 

    // Detect numeric list pattern like "1. " or "1) " using regex
    let re_num = Regex::new(r"(?P<prefix>\d+[\.)]\s)").unwrap();

    // First, check numeric markers
    if re_num.is_match(trimmed) {
        // split by occurrences of the numeric marker while keeping the marker
        let mut last = 0usize;
        for cap in re_num.captures_iter(trimmed) {
            if let Some(m) = cap.get(0) {
                let start = m.start();
                if start != last {
                    let chunk = &trimmed[last..start];
                    if !chunk.trim().is_empty() {
                        items.push(chunk.trim().to_string());
                    }
                }
                last = start;
            }
        }
        if last < trimmed.len() {
            items.push(trimmed[last..].trim().to_string());
        }
        if items.len() > 1 {
            return items;
        }
    }

    // For symbolic markers
    // If the line contains multiple occurrences of any marker, split
    for marker in &markers {
        let count = trimmed.matches(marker).count();
        if count > 1 {
            // split while keeping markers
            let parts: Vec<&str> = trimmed.split(marker).collect();
            for (i, p) in parts.iter().enumerate() {
                if i == 0 {
                    if p.trim().is_empty() {
                        continue;
                    } else {
                        // first part may start without marker
                        items.push(p.trim().to_string());
                    }
                } else {
                    let s = format!("{}{}", marker, p.trim());
                    items.push(s);
                }
            }
            if items.len() > 1 {
                return items;
            }
        }
    }

    // If single marker at start and contains internal newlines, split by newline
    if is_list_item(trimmed) && trimmed.contains('\n') {
        for line in trimmed.lines() {
            if !line.trim().is_empty() {
                items.push(line.trim().to_string());
            }
        }
        if !items.is_empty() {
            return items;
        }
    }

    // Default: return the whole block as single item
    vec![text.to_string()]
}

fn strip_leading_marker(s: &str) -> String {
    let t = s.trim();
    // Symbol markers (single unicode char + space)
    if t.starts_with("☐ ") || t.starts_with("• ") || t.starts_with("- ") || t.starts_with("* ") {
        // skip the first char and the following space
        let without = t.chars().skip(1).collect::<String>();
        return without.trim_start().to_string();
    }
    // Numeric markers
    let re_num = Regex::new(r"^\s*\d+[\.)]\s").unwrap();
    if re_num.is_match(t) {
        return re_num.replace(t, "").to_string().trim().to_string();
    }
    t.to_string()
}

fn parse_html_tags(text: &str) -> (String, bool) {
    // Returns (cleaned_text, is_centered)
    let re_center = Regex::new(r"</?center>").unwrap();
    let re_table_tags = Regex::new(r"</?(?:table|tr|td|th|thead|tbody)>").unwrap();

    let is_centered = text.contains("<center>");
    let mut cleaned = text.to_string();

    // Remove center tags
    cleaned = re_center.replace_all(&cleaned, "").to_string();
    // Remove table tags but keep content
    cleaned = re_table_tags.replace_all(&cleaned, " ").to_string();

    (cleaned.trim().to_string(), is_centered)
}

fn parse_markdown_headers(text: &str) -> (String, u8) {
    // Returns (text_without_header_markers, header_level)
    // header_level: 0=normal, 1=h1(#), 2=h2(##), 3=h3(###), etc.
    let trimmed = text.trim();
    let mut level = 0u8;
    let mut chars = trimmed.chars();
    
    // Count leading # characters
    while let Some(ch) = chars.next() {
        if ch == '#' {
            level += 1;
        } else if ch.is_whitespace() {
            break;
        } else {
            level = 0;
            break;
        }
    }
    
    if level > 0 && level <= 6 {
        // Remove the leading #'s and whitespace
        let content = trimmed.trim_start_matches('#').trim();
        (content.to_string(), level)
    } else {
        (text.to_string(), 0)
    }
}

fn parse_table_html(table_html: &str) -> Vec<Vec<String>> {
    // Extract <tr> and <td> contents
    let mut rows: Vec<Vec<String>> = Vec::new();
    let re_row = Regex::new(r"(?si)<tr>(.*?)</tr>").unwrap();
    let re_cell = Regex::new(r"(?si)<t[dh]>(.*?)</t[dh]>").unwrap();

    for row_cap in re_row.captures_iter(table_html) {
        let row_body = row_cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let mut cols: Vec<String> = Vec::new();
        for cell_cap in re_cell.captures_iter(row_body) {
            let cell_text = cell_cap.get(1).map(|m| m.as_str()).unwrap_or("");
            cols.push(cell_text.trim().to_string());
        }
        if !cols.is_empty() {
            rows.push(cols);
        }
    }
    rows
}

fn render_table_plain(
    rows: Vec<Vec<String>>,
    current_layer: &PdfLayerReference,
    font: &IndirectFontRef,
    font_bold: &IndirectFontRef,
    y_position: f32,
    margin_left: f32,
    usable_width: f32,
) -> f32 {
    // Render a table with column widths based on content (ASCII-style alignment)
    if rows.is_empty() {
        return y_position;
    }

    let cols = rows.get(0).map(|r| r.len()).unwrap_or(1) as usize;
    
    // Calculate max content width for each column
    let mut col_max_chars: Vec<usize> = vec![0; cols];
    for row in &rows {
        for (col_idx, cell) in row.iter().enumerate() {
            if col_idx < cols {
                col_max_chars[col_idx] = col_max_chars[col_idx].max(cell.len());
            }
        }
    }
    
    // Calculate proportional widths based on content
    let total_chars: usize = col_max_chars.iter().sum();
    let col_widths: Vec<f32> = if total_chars > 0 {
        col_max_chars.iter().map(|&max_chars| {
            (max_chars as f32 / total_chars as f32) * usable_width
        }).collect()
    } else {
        vec![usable_width / (cols as f32); cols]
    };
    
    let mut y = y_position;
    let table_left = margin_left;
    let table_right = table_left + usable_width;
    let mut drew_top_border = false;

    // Draw rows
    for (row_idx, row) in rows.iter().enumerate() {
        // Find max number of wrapped lines in this row
        let mut max_lines = 1usize;
        let mut cell_lines: Vec<Vec<String>> = Vec::new();
        for (ci, cell) in row.iter().enumerate() {
            let col_width = if ci < col_widths.len() { col_widths[ci] } else { 50.0 };
            let approx_chars = ((col_width) / (10.0 * 0.5)) as usize; // assume 10pt font for table
            let mut lines = Vec::new();
            let mut cur = String::new();
            for word in cell.split_whitespace() {
                if cur.len() + word.len() + 1 > approx_chars && !cur.is_empty() {
                    lines.push(cur.clone());
                    cur.clear();
                }
                if !cur.is_empty() {
                    cur.push(' ');
                }
                cur.push_str(word);
            }
            if !cur.is_empty() {
                lines.push(cur);
            }
            max_lines = max_lines.max(lines.len());
            cell_lines.push(lines);
        }

        // If not enough vertical space, skip (caller will manage page breaks)
        let row_height = 8.0 * (max_lines as f32);
        if y - row_height < 20.0 {
            // Caller should add page; we simply return current y so they can add a page
            break;
        }

        // Print each cell line-by-line
        let is_header = row_idx == 0;  // First row is header
        let cell_font = if is_header { font_bold } else { font };
        let font_size = if is_header { 9.5 } else { 9.0 };
        
        for line_index in 0..max_lines {
            let mut x = margin_left;
            for (ci, lines) in cell_lines.iter().enumerate() {
                let text = lines.get(line_index).cloned().unwrap_or_default();
                current_layer.use_text(&text, font_size, Mm(x), Mm(y), cell_font);
                let col_width = if ci < col_widths.len() { col_widths[ci] } else { 50.0 };
                x += col_width;
            }
            y -= 8.0;
        }
        y -= 4.0; // small spacing after row
        let row_top = y + row_height + 4.0;
        let row_bottom = y + 4.0;

        if !drew_top_border {
            draw_horizontal_line(current_layer, table_left, table_right, row_top + 1.0);
            drew_top_border = true;
        }
        draw_horizontal_line(current_layer, table_left, table_right, row_bottom - 1.0);

        // Draw vertical lines at column boundaries using actual column widths
        let mut x_line = margin_left;
        draw_vertical_line(current_layer, x_line, row_top + 1.0, row_bottom - 1.0);
        for col_idx in 0..cols {
            let col_width = if col_idx < col_widths.len() { col_widths[col_idx] } else { 50.0 };
            x_line += col_width;
            draw_vertical_line(current_layer, x_line, row_top + 1.0, row_bottom - 1.0);
        }
    }

    y
}

fn build_ascii_table(rows: &[Vec<String>]) -> Vec<String> {
    if rows.is_empty() {
        return Vec::new();
    }

    let max_columns = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    if max_columns == 0 {
        return Vec::new();
    }

    // Calculate max cell widths from all rows, including headers
    // Do NOT limit width - let it expand naturally to fit content
    let mut col_widths = vec![0; max_columns];
    for row in rows {
        for (i, cell) in row.iter().enumerate() {
            // For coordinate mode compatibility, cap at reasonable size but allow headers to expand
            let cell_width = cell.len();
            col_widths[i] = col_widths[i].max(cell_width);
        }
    }

    let border_line = |widths: &[usize]| {
        let mut builder = String::new();
        builder.push('+');
        for width in widths {
            builder.push_str(&"-".repeat(width + 2));
            builder.push('+');
        }
        builder
    };

    let mut ascii_lines = Vec::new();
    let top_border = border_line(&col_widths);
    ascii_lines.push(top_border.clone());

    for row in rows {
        let mut line = String::new();
        line.push('|');
        for (i, width) in col_widths.iter().enumerate() {
            let cell_text = row.get(i).map(String::as_str).unwrap_or("");
            let padded = format!(" {:width$} ", cell_text, width = *width);
            line.push_str(&padded);
            line.push('|');
        }
        ascii_lines.push(line);
        ascii_lines.push(border_line(&col_widths));
    }

    ascii_lines
}

fn draw_horizontal_line(layer: &PdfLayerReference, start_x: f32, end_x: f32, y: f32) {
    let line = Line::from_iter(vec![
        (Point::new(Mm(start_x), Mm(y)), false),
        (Point::new(Mm(end_x), Mm(y)), false),
    ]);
    layer.add_line(line);
}

fn draw_vertical_line(layer: &PdfLayerReference, x: f32, y_top: f32, y_bottom: f32) {
    let line = Line::from_iter(vec![
        (Point::new(Mm(x), Mm(y_top)), false),
        (Point::new(Mm(x), Mm(y_bottom)), false),
    ]);
    layer.add_line(line);
}

fn render_html_table(
    layer: &PdfLayerReference,
    rows: &[Vec<String>],
    start_x: f32,
    start_y: f32,
    max_width: f32,
    font: &IndirectFontRef,
    font_size: f32,
) -> f32 {
    // Returns the Y position after the table
    if rows.is_empty() {
        return start_y;
    }

    // Calculate column widths
    let num_cols = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    if num_cols == 0 {
        return start_y;
    }

    let mut col_widths = vec![0usize; num_cols];
    for row in rows {
        for (i, cell) in row.iter().enumerate() {
            col_widths[i] = col_widths[i].max(cell.len());
        }
    }

    // Calculate column widths in mm
    let pt_to_mm = 0.352778;
    let avg_char_width = (font_size * 0.5 * pt_to_mm) as f32;
    let cell_padding = 0.5; // mm padding inside cells (left and right)
    let border_width = 1.0; // mm width for vertical borders
    
    // Total border width: (num_cols + 1) vertical lines, each 1mm
    let total_border_width = (num_cols as f32 + 1.0) * border_width;
    // Total padding width: each of num_cols cells has 2 * cell_padding
    let total_padding_width = (num_cols as f32) * (cell_padding * 2.0);
    
    let available_width = (max_width - total_border_width - total_padding_width).max(10.0);
    let total_chars: f32 = col_widths.iter().map(|w| *w as f32).sum();
    
    // col_widths_mm = actual content width for each column (without padding or borders)
    let mut col_widths_mm = vec![0.0; num_cols];
    for (i, width) in col_widths.iter().enumerate() {
        col_widths_mm[i] = if total_chars > 0.0 {
            (*width as f32 / total_chars) * available_width
        } else {
            available_width / num_cols as f32
        };
    }

    let base_line_height = 5.5; // mm per line in a cell
    // In PDF, text is anchored at baseline. To center text vertically in the cell:
    // We need to account for ascender/descender space. Approximate: baseline is ~30% from bottom
    let text_center_y = (base_line_height / 2.0) + (font_size * 0.1 * pt_to_mm);

    let mut current_y = start_y;
    let mut current_x = start_x;

    // First pass: Calculate row heights based on wrapped text
    let mut row_heights = Vec::new();
    for row in rows {
        let mut max_lines_in_row = 1;
        for (col_idx, cell) in row.iter().enumerate() {
            if col_idx < col_widths_mm.len() {
                let col_width = col_widths_mm[col_idx];
                // col_width is pure content width without padding
                // Be conservative with character width calculation to avoid overflow
                let safety_factor = 0.85; // Leave 15% margin for safety
                let max_chars_per_line = ((col_width * safety_factor) / avg_char_width).max(1.0) as usize;
                
                // Count lines needed for this cell
                let words: Vec<&str> = cell.split_whitespace().collect();
                let mut lines = 1;
                let mut current_line_len = 0;
                for word in words {
                    if current_line_len + word.len() + 1 > max_chars_per_line && current_line_len > 0 {
                        lines += 1;
                        current_line_len = word.len();
                    } else {
                        current_line_len += word.len() + 1;
                    }
                }
                max_lines_in_row = max_lines_in_row.max(lines);
            }
        }
        row_heights.push(base_line_height * max_lines_in_row as f32 + (cell_padding * 2.0));
    }

    // Draw top border
    let total_table_width: f32 = col_widths_mm.iter().sum::<f32>() + total_border_width + total_padding_width;
    draw_horizontal_line(layer, current_x, current_x + total_table_width, current_y);

    // Draw rows
    for (row_idx, row) in rows.iter().enumerate() {
        let row_height = row_heights.get(row_idx).copied().unwrap_or(base_line_height);
        
        // Draw left border
        draw_vertical_line(layer, current_x, current_y, current_y - row_height);
        
        // Draw cells
        let mut cell_x = current_x + border_width; // start after left border
        for (col_idx, cell) in row.iter().enumerate() {
            if col_idx < col_widths_mm.len() {
                let col_width = col_widths_mm[col_idx]; // pure content width
                // Be conservative with character width calculation to avoid overflow
                let safety_factor = 0.85; // Leave 15% margin for safety
                let max_chars_per_line = ((col_width * safety_factor) / avg_char_width).max(1.0) as usize;
                
                // Wrap text into multiple lines if needed
                let words: Vec<&str> = cell.split_whitespace().collect();
                let mut text_lines = Vec::new();
                let mut current_line = String::new();
                for word in words {
                    if current_line.len() + word.len() + 1 > max_chars_per_line && !current_line.is_empty() {
                        text_lines.push(current_line.clone());
                        current_line.clear();
                    }
                    if !current_line.is_empty() {
                        current_line.push(' ');
                    }
                    current_line.push_str(word);
                }
                if !current_line.is_empty() {
                    text_lines.push(current_line);
                }
                
                // Draw each line of text in the cell with proper padding
                let cell_text_x = cell_x + cell_padding;
                let mut line_y = current_y - cell_padding - text_center_y;
                for text_line in text_lines {
                    layer.use_text(&text_line, font_size, Mm(cell_text_x), Mm(line_y), font);
                    line_y -= base_line_height;
                }

                // Move to next cell: current position + content width + padding on both sides + border
                cell_x += col_width + (cell_padding * 2.0) + border_width;
                draw_vertical_line(layer, cell_x, current_y, current_y - row_height);
            }
        }

        // Draw horizontal border after row
        current_y -= row_height;
        draw_horizontal_line(layer, start_x, start_x + total_table_width, current_y);
    }

    // Return final Y position with some spacing after table
    current_y - 2.0
}

fn convert_markdown_to_pdf(
    markdown: &str,
    output_path: &Path,
    use_coordinates: bool,
) -> Result<()> {
    println!(
        "convert_markdown_to_pdf: use_coordinates={} output={}",
        use_coordinates,
        output_path.display()
    );
    if use_coordinates {
        convert_with_coordinates(markdown, output_path)
    } else {
        convert_plain_text(markdown, output_path)
    }
}

#[derive(Debug, Clone)]
struct TextBlock {
    text: String,
    x: f32,
    y: f32,
    _width: f32,
    height: f32,
    force_page_break: bool, // True if this block should start on a new page
    image_index: usize,     // Index of source image (for grouping before sorting)
}

fn parse_ocr_blocks(markdown: &str) -> Vec<TextBlock> {
    let mut blocks = Vec::new();
    let lines: Vec<&str> = markdown.lines().collect();
    let mut next_block_needs_page_break = false;
    let mut current_image_index = 0;

    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        
        // Check for image index marker
        if line.starts_with("---IMAGE_INDEX:") {
            if let Some(idx_str) = line.strip_prefix("---IMAGE_INDEX:") {
                if let Some(idx_str) = idx_str.strip_suffix("---") {
                    if let Ok(idx) = idx_str.trim().parse::<usize>() {
                        current_image_index = idx;
                    }
                }
            }
            i += 1;
            continue;
        }
        
        // Check for explicit page break marker
        if line.trim() == "---PAGE_BREAK---" {
            next_block_needs_page_break = true;
            i += 1;
            continue;
        }

        // Look for <|det|> tag with coordinates
        if let Some(det_start) = line.find("<|det|>") {
            if let Some(det_end) = line.find("<|/det|>") {
                let coords_str = &line[det_start + 7..det_end];

                // Parse coordinates [[x1, y1, x2, y2]]
                if let Some(coords) = parse_coordinates(coords_str) {
                    // Get the text from the next line(s) until we hit another tag
                    let mut text_lines = Vec::new();
                    let mut j = i + 1;

                    while j < lines.len() {
                        let next_line = lines[j].trim();
                        if next_line.starts_with("<|") || next_line.is_empty() {
                            break;
                        }
                        text_lines.push(next_line);
                        j += 1;
                    }

                    if !text_lines.is_empty() {
                        let text = text_lines.join(" ");
                        blocks.push(TextBlock {
                            text,
                            x: coords[0],
                            y: coords[1],
                            _width: coords[2] - coords[0],
                            height: coords[3] - coords[1],
                            force_page_break: next_block_needs_page_break,
                            image_index: current_image_index,
                        });
                        next_block_needs_page_break = false; // Reset flag after use
                    }

                    i = j;
                    continue;
                }
            }
        }
        i += 1;
    }

    blocks
}

fn parse_coordinates(coords_str: &str) -> Option<[f32; 4]> {
    // Parse [[x1, y1, x2, y2]] format
    let coords_str = coords_str.trim();
    if !coords_str.starts_with("[[") || !coords_str.ends_with("]]") {
        return None;
    }

    let inner = &coords_str[2..coords_str.len() - 2];
    let parts: Vec<&str> = inner.split(',').collect();

    if parts.len() != 4 {
        return None;
    }

    let mut coords = [0.0; 4];
    for (i, part) in parts.iter().enumerate() {
        if let Ok(val) = part.trim().parse::<f32>() {
            coords[i] = val;
        } else {
            return None;
        }
    }

    Some(coords)
}

fn convert_with_coordinates(markdown: &str, output_path: &Path) -> Result<()> {
    use printpdf::*;
    println!(
        "convert_with_coordinates: starting. output={}",
        output_path.display()
    );
    let blocks = parse_ocr_blocks(markdown);

    if blocks.is_empty() {
        return convert_plain_text(markdown, output_path);
    }

    let page_width = Mm(210.0);
    let page_height = Mm(297.0);
    let margin = 5.0; // Margen muy reducido
    let usable_width = 200.0; // Casi toda la página
    let usable_height = 287.0;

    let (doc, page1, layer1) = PdfDocument::new("OCR Document", page_width, page_height, "Layer 1");

    let font = doc.add_builtin_font(BuiltinFont::Helvetica)?;
    let font_bold = doc.add_builtin_font(BuiltinFont::HelveticaBold)?;
    let mono_font = doc.add_builtin_font(BuiltinFont::Courier)?;
    let mut current_layer = doc.get_page(page1).get_layer(layer1);

    // Group blocks by image_index, then sort within each group by Y position
    let mut sorted_blocks = blocks.clone();
    sorted_blocks.sort_by(|a, b| {
        // First sort by image_index
        match a.image_index.cmp(&b.image_index) {
            std::cmp::Ordering::Equal => {
                // Within same image, sort by Y position
                a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal)
            }
            other => other,
        }
    });

    let mut page_start_y = 0.0;
    let scale = 0.20; // Escala muy reducida para evitar que los bloques ocupen demasiado
    
    // Track last Y position per column to allow side-by-side layout
    // Determine column boundaries based on actual OCR block positions, not fixed page center
    let mut last_y_left = 0.0;
    let mut last_y_right = 0.0;
    
    // Track previous block Y to detect new images (Y coordinate resets)
    let mut prev_block_y = 0.0;
    let mut force_new_page = false;

    for block in sorted_blocks {
        // Check if this block has explicit page break marker
        if block.force_page_break {
            force_new_page = true;
        }
        
        // Detect if this is a new image (Y coordinate jumped backwards significantly)
        // This indicates OCR from a new image where coordinates reset
        if prev_block_y > 100.0 && block.y < prev_block_y - 50.0 {
            force_new_page = true;
        }
        prev_block_y = block.y;
        
        // Check for list item BEFORE any processing
        let is_list = is_list_item(&block.text);
        
        // Check if this is a table BEFORE cleaning HTML tags
        let is_table = block.text.to_lowercase().contains("<table>");
        
        // Parse markdown headers FIRST, before cleaning HTML
        let cleaned_text = clean_markdown(&block.text);
        let (text_with_header, header_level) = parse_markdown_headers(&cleaned_text);
        let (text, _) = if !is_table {
            parse_html_tags(&text_with_header)
        } else {
            // For tables, preserve the HTML structure
            (text_with_header, false)
        };
        
        if text.is_empty() {
            continue;
        }

        let x_mm = (block.x * scale + margin).min(usable_width);
        let block_y_mm = block.y * scale;

        // Force new page if we detected a new image (Y coordinate reset or explicit marker)
        if force_new_page {
            let (page, layer) = doc.add_page(page_width, page_height, "Layer 1");
            current_layer = doc.get_page(page).get_layer(layer);
            page_start_y = 0.0;  // Reset to 0 so blocks start fresh from top with proper margin
            last_y_left = 0.0;
            last_y_right = 0.0;
            force_new_page = false;
        }

        // Check if we need a new page due to content overflow
        if block_y_mm - page_start_y > usable_height {
            let (page, layer) = doc.add_page(page_width, page_height, "Layer 1");
            current_layer = doc.get_page(page).get_layer(layer);
            page_start_y = 0.0;  // Reset to 0 for clean start on new page
            last_y_left = 0.0;
            last_y_right = 0.0;
        }

        let relative_y = block_y_mm - page_start_y;
        let mut y_mm = (page_height.0 - margin - relative_y).max(margin);

        // Determine column based on X position - use 95mm threshold instead of page center
        // This better accommodates varying column widths
        let is_left_column = x_mm < 95.0;
        
        // Calculate base font size first to use for spacing
        let base_font_size = ((block.height * scale * 0.5).max(6.0).min(10.0)) as f32;
        
        // Dynamic spacing based on font size: approximately 1.5x line height in mm
        // Convert points to mm: 1 pt ≈ 0.3528 mm
        let min_spacing = (base_font_size * 0.3528 * 1.5).max(2.5);
        
        // Ensure minimum spacing from previous text in SAME COLUMN
        if is_left_column {
            if last_y_left > 0.0 && last_y_left - y_mm < min_spacing {
                y_mm = last_y_left - min_spacing;
            }
        } else {
            if last_y_right > 0.0 && last_y_right - y_mm < min_spacing {
                y_mm = last_y_right - min_spacing;
            }
        }

        // Determine font size based on header level
        let (font_size, current_font) = if header_level > 0 {
            // Scale up font for headers: h1=2x, h2=1.5x, h3=1.3x, etc.
            // Use bold font for headers
            let size = match header_level {
                1 => (base_font_size * 2.0).min(18.0),
                2 => (base_font_size * 1.5).min(14.0),
                3 => (base_font_size * 1.3).min(12.0),
                _ => base_font_size,
            };
            (size, &font_bold)
        } else {
            (base_font_size, &font)
        };

        // Text wrapping: use the block's actual OCR width, ensuring it fits on page
        // Limit column width to prevent overflow
        let max_column_width = 95.0; // Máximo ~95mm por columna (deja espacio para 2 columnas)
        let available_width_to_right = (page_width.0 - margin - x_mm).max(20.0);
        let desired_block_width = (block._width * scale).max(25.0);
        // Limitar al mínimo de: ancho del bloque OCR, ancho disponible, y máximo de columna
        let block_width_mm = desired_block_width.min(available_width_to_right).min(max_column_width);
        
        // Compute char width in mm - use actual font width estimation
        let pt_to_mm = 0.352778;
        let avg_char_width_mm = (font_size as f32) * 0.50 * pt_to_mm;
        let max_chars = if avg_char_width_mm > 0.0 {
            ((block_width_mm / avg_char_width_mm) as usize).max(15)
        } else {
            60
        };

        // Check for tables FIRST before processing as list or regular text
        if text.to_lowercase().contains("<table>") {
            // Parse html table and render with HTML borders
            let rows = parse_table_html(&text);
            if !rows.is_empty() {
                let table_font_size = 8.0;
                let final_y = render_html_table(&current_layer, &rows, x_mm, y_mm, block_width_mm, &font, table_font_size);
                
                // Update last_y for the correct column
                if is_left_column {
                    last_y_left = final_y;
                } else {
                    last_y_right = final_y;
                }
            }
        } else if is_list {
            // Split into list items only if we already know this is a list
            let items = split_list_items(&text);
            // Render each list item with bold bullet and wrapped text
            let bullet_font = &font_bold;
            let body_font = &font;
            let bullet_pt = base_font_size.max(8.0);
            let pt_to_mm = 0.352778;
            let avg_char_width_mm = (bullet_pt * 0.5 * pt_to_mm as f32) as f32;
            let bullet_offset = avg_char_width_mm * 2.0;
            let mut item_y = y_mm;
            for item in items {
                let mut item_text = strip_leading_marker(&item);

                // Draw bold bullet
                current_layer.use_text("•", bullet_pt as f32, Mm(x_mm), Mm(item_y), bullet_font);

                // Wrap item_text similarly to normal wrapping but shifted by bullet_offset
                let max_chars_item = max_chars; // reuse char estimation
                let words: Vec<&str> = item_text.split_whitespace().collect();
                let mut current_line = String::new();
                let mut line_y = item_y;
                for word in words {
                    if current_line.len() + word.len() + 1 > max_chars_item && !current_line.is_empty() {
                        current_layer.use_text(&current_line, base_font_size, Mm(x_mm + bullet_offset), Mm(line_y), body_font);
                        line_y -= base_font_size * 0.35;
                        current_line.clear();
                        if line_y < margin {
                            let (page, layer) = doc.add_page(page_width, page_height, "Layer 1");
                            current_layer = doc.get_page(page).get_layer(layer);
                            page_start_y = block_y_mm;
                            line_y = page_height.0 - margin - 10.0;
                        }
                    }
                    if !current_line.is_empty() {
                        current_line.push(' ');
                    }
                    current_line.push_str(word);
                }
                if !current_line.is_empty() {
                    current_layer.use_text(&current_line, base_font_size, Mm(x_mm + bullet_offset), Mm(line_y), body_font);
                    // update last_y accordingly
                    if is_left_column {
                        last_y_left = line_y - base_font_size * 0.35;
                    } else {
                        last_y_right = line_y - base_font_size * 0.35;
                    }
                    item_y = line_y;
                }
                // small gap after each item
                item_y -= (base_font_size * 0.35) + 1.0;
            }
        } else if text.len() > max_chars {
            // Use pre-detected list status for indentation
            let list_indent = if is_list { get_list_indent() } else { 0.0 };
            let render_x = x_mm + list_indent;
            
            let words: Vec<&str> = text.split_whitespace().collect();
            let mut current_line = String::new();
            let mut line_y = y_mm;

            for word in words {
                if current_line.len() + word.len() + 1 > max_chars && !current_line.is_empty() {
                    current_layer.use_text(&current_line, font_size, Mm(render_x), Mm(line_y), current_font);
                    line_y -= font_size * 0.35; // Slightly tighter line spacing
                    current_line.clear();

                    // Check if wrapped text goes to new page
                    if line_y < margin {
                        let (page, layer) = doc.add_page(page_width, page_height, "Layer 1");
                        current_layer = doc.get_page(page).get_layer(layer);
                        page_start_y = block_y_mm;
                        line_y = page_height.0 - margin - 10.0;
                    }
                }
                if !current_line.is_empty() {
                    current_line.push(' ');
                }
                current_line.push_str(word);
            }

            if !current_line.is_empty() {
                current_layer.use_text(&current_line, font_size, Mm(render_x), Mm(line_y), current_font);
                // Update last_y for the correct column
                if is_left_column {
                    last_y_left = line_y - font_size * 0.35;
                } else {
                    last_y_right = line_y - font_size * 0.35;
                }
            }
        } else {
            // Use pre-detected list status for indentation
            let list_indent = if is_list { get_list_indent() } else { 0.0 };
            let render_x = x_mm + list_indent;
            
            current_layer.use_text(&text, font_size, Mm(render_x), Mm(y_mm), current_font);
            // Update last_y for the correct column
            if is_left_column {
                last_y_left = y_mm - font_size * 0.35;
            } else {
                last_y_right = y_mm - font_size * 0.35;
            }
        }
    }

    println!(
        "convert_with_coordinates: saving PDF to {}",
        output_path.display()
    );
    doc.save(&mut std::io::BufWriter::new(std::fs::File::create(
        output_path,
    )?))?;

    Ok(())
}

fn convert_plain_text(markdown: &str, output_path: &Path) -> Result<()> {
    use printpdf::*;

    println!(
        "convert_plain_text: starting. output={} markdown_len={}",
        output_path.display(),
        markdown.len()
    );

    let (doc, page1, layer1) = PdfDocument::new("OCR Document", Mm(210.0), Mm(297.0), "Layer 1");

    let font = doc.add_builtin_font(BuiltinFont::Helvetica)?;
    let font_bold = doc.add_builtin_font(BuiltinFont::HelveticaBold)?;
    let mut current_layer = doc.get_page(page1).get_layer(layer1);

    let mut y_position = 280.0;
    let margin_left = 5.0;
    let margin_right = 5.0;
    let page_width = 210.0;
    let usable_width = page_width - margin_left - margin_right;

    // Clean the markdown first - remove ALL tags for plain mode
    let cleaned = clean_markdown_for_plain(markdown);

    let re_num = Regex::new(r"^\s*\d+[\.)]\s").unwrap();
    let lines: Vec<&str> = cleaned.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();
        if trimmed.is_empty() {
            y_position -= 3.0;
            i += 1;
            continue;
        }

        // Check if we need a new page
        if y_position < 20.0 {
            let (page, layer) = doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
            current_layer = doc.get_page(page).get_layer(layer);
            y_position = 280.0;
        }

        // Handle list items: split multiple items in the same line into separate list elements
        // IMPORTANT: Only consider it a list if is_list_item() is true FIRST
        if is_list_item(trimmed) {
            let list_items = split_list_items(trimmed);
            // Render each list item on its own line with a bold bullet
            let font_size = 10.0;
            let pt_to_mm = 0.352778_f32;
            let avg_char_width_mm = (font_size * 0.5_f32 * pt_to_mm).max(0.1_f32);
            let bullet_offset = avg_char_width_mm * 2.0; // space for bold dot
            let line_step = 5.0;

            for item in list_items {
                if y_position < 20.0 {
                    let (page, layer) = doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
                    current_layer = doc.get_page(page).get_layer(layer);
                    y_position = 280.0;
                }
                // Determine marker stripped text
                let stripped = item.trim();
                let rendered_text = strip_leading_marker(stripped);

                // Draw bold bullet
                current_layer.use_text("•", font_size, Mm(margin_left), Mm(y_position), &font_bold);

                // Wrap the rest of the text within available width
                let max_line_width = usable_width - bullet_offset - 1.0;
                let space_width = avg_char_width_mm;
                let mut current_line = String::new();
                let mut current_line_width = 0.0;
                for word in rendered_text.split_whitespace() {
                    let word_width = word.len() as f32 * avg_char_width_mm;
                    let extra_space = if current_line.is_empty() { 0.0 } else { space_width };
                    if current_line_width + extra_space + word_width > max_line_width && !current_line.is_empty() {
                        // flush
                        current_layer.use_text(&current_line, font_size, Mm(margin_left + bullet_offset), Mm(y_position), &font);
                        y_position -= line_step;
                        current_line.clear();
                        current_line_width = 0.0;
                    }
                    if !current_line.is_empty() {
                        current_line.push(' ');
                        current_line_width += space_width;
                    }
                    current_line.push_str(word);
                    current_line_width += word_width;
                }
                if !current_line.is_empty() {
                    current_layer.use_text(&current_line, font_size, Mm(margin_left + bullet_offset), Mm(y_position), &font);
                    y_position -= line_step;
                }
                y_position -= 2.0; // small gap after item
            }
            i += 1;
            continue;
        }

        // Table handling: Check for <table> BEFORE stripping HTML tags
        if trimmed.to_lowercase().contains("<table>") {
            let mut table_block = String::new();
            table_block.push_str(trimmed);
            i += 1;
            while i < lines.len() {
                let l = lines[i];
                table_block.push_str("\n");
                table_block.push_str(l);
                if l.trim().to_lowercase().contains("</table>") {
                    break;
                }
                i += 1;
            }
            let rows = parse_table_html(&table_block);
            
            if !rows.is_empty() {
                // Check if we need a new page
                if y_position < 50.0 {
                    let (page, layer) = doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
                    current_layer = doc.get_page(page).get_layer(layer);
                    y_position = 280.0;
                }
                
                // Render HTML table with borders
                let table_font_size = 9.0;
                y_position = render_html_table(&current_layer, &rows, margin_left, y_position, usable_width, &font, table_font_size);
                y_position -= 5.0; // spacing after table
            }
            i += 1;
            continue;
        }

        // Parse HTML tags
        let (text_without_html, is_centered) = parse_html_tags(trimmed);

        // Determine font size and style based on markdown formatting
        let (text, font_size, line_spacing, use_bold) = if text_without_html.starts_with("# ") {
            (text_without_html.trim_start_matches("# "), 18.0, 10.0, true)
        } else if text_without_html.starts_with("## ") {
            (text_without_html.trim_start_matches("## "), 16.0, 8.0, true)
        } else if text_without_html.starts_with("### ") {
            (
                text_without_html.trim_start_matches("### "),
                14.0,
                7.0,
                true,
            )
        } else if text_without_html.starts_with("#### ") {
            (
                text_without_html.trim_start_matches("#### "),
                12.0,
                6.0,
                true,
            )
        } else {
            (text_without_html.as_str(), 10.0, 5.0, false)
        };

        let pt_to_mm = 0.352778_f32;
        let avg_char_width_mm = (font_size * 0.5_f32 * pt_to_mm).max(0.1_f32);
        let max_line_width = (usable_width - 1.0_f32).max(avg_char_width_mm);
        let space_width = avg_char_width_mm;
        let line_step = line_spacing * 0.8_f32;
        let mut current_line = String::new();
        let mut current_line_width = 0.0;

        let mut flush_line = |line: &str, line_width_mm: f32| -> Result<()> {
            if line.is_empty() {
                return Ok(());
            }

            let approx_line_width = line_width_mm.max(avg_char_width_mm);
            let x_pos = if is_centered {
                margin_left + ((usable_width - approx_line_width) / 2.0).max(0.0)
            } else {
                margin_left
            };

            let selected_font = if use_bold { &font_bold } else { &font };
            current_layer.use_text(line, font_size, Mm(x_pos), Mm(y_position), selected_font);
            y_position -= line_step;

            if y_position < 20.0 {
                let (page, layer) = doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
                current_layer = doc.get_page(page).get_layer(layer);
                y_position = 280.0;
            }

            Ok(())
        };

        // Word wrapping using width-based accumulation
        let words: Vec<&str> = text.split_whitespace().collect();

        for word in words {
            let word_width = word.len() as f32 * avg_char_width_mm;
            let extra_space = if current_line.is_empty() {
                0.0
            } else {
                space_width
            };

            if current_line_width + extra_space + word_width > max_line_width
                && !current_line.is_empty()
            {
                flush_line(&current_line, current_line_width)?;
                current_line.clear();
                current_line_width = 0.0;
            }

            if !current_line.is_empty() {
                current_line.push(' ');
                current_line_width += space_width;
            }

            current_line.push_str(word);
            current_line_width += word_width;
        }

        if !current_line.is_empty() {
            flush_line(&current_line, current_line_width)?;
        }

        y_position -= line_spacing;
        i += 1;
    }

    println!(
        "convert_plain_text: saving PDF to {}",
        output_path.display()
    );
    doc.save(&mut std::io::BufWriter::new(std::fs::File::create(
        output_path,
    )?))?;

    Ok(())
}
