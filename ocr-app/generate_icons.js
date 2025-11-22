const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SOURCE_IMAGE = path.join(__dirname, 'public', 'logo-transparent.png');
const OUTPUT_DIR = path.join(__dirname, 'public');

const SIZES = [16, 24, 32, 48, 64, 128, 192, 256, 512, 1024];

async function generateIcons() {
    console.log(`Reading source image from: ${SOURCE_IMAGE}`);

    if (!fs.existsSync(SOURCE_IMAGE)) {
        console.error('Source image not found!');
        process.exit(1);
    }

    for (const size of SIZES) {
        const padding = Math.floor(size * 0.2); // 20% padding
        const innerSize = size - (padding * 2);

        console.log(`Generating icon-${size}.png (Inner size: ${innerSize}px, Padding: ${padding}px)`);

        await sharp(SOURCE_IMAGE)
            .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .extend({
                top: padding,
                bottom: padding,
                left: padding,
                right: padding,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .toFile(path.join(OUTPUT_DIR, `icon-${size}.png`));
    }

    // Generate main icon.png (usually 512x512 or 1024x1024)
    console.log('Generating main icon.png (1024x1024)');
    const size = 1024;
    const padding = Math.floor(size * 0.2);
    const innerSize = size - (padding * 2);

    await sharp(SOURCE_IMAGE)
        .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .extend({
            top: padding,
            bottom: padding,
            left: padding,
            right: padding,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toFile(path.join(OUTPUT_DIR, 'icon.png'));

    console.log('✓ Icons generated successfully!');
}

generateIcons().catch(err => {
    console.error('Error generating icons:', err);
    process.exit(1);
});
