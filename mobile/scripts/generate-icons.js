const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, '../../public/logo.png');
const ASSETS_DIR = path.join(__dirname, '../assets');
const ICON_SIZE = 1024;

// Brand colors
const BRAND_COLORS = {
  primary: '#2563eb',
  background: '#ffffff',
};

async function generateIcons() {
  try {
    // Check if logo exists
    if (!fs.existsSync(LOGO_PATH)) {
      throw new Error(`Logo not found at ${LOGO_PATH}`);
    }

    // Read logo metadata
    const logoMetadata = await sharp(LOGO_PATH).metadata();
    console.log(`Logo dimensions: ${logoMetadata.width}x${logoMetadata.height}`);
    console.log(`Logo format: ${logoMetadata.format}`);

    // Ensure assets directory exists
    if (!fs.existsSync(ASSETS_DIR)) {
      fs.mkdirSync(ASSETS_DIR, { recursive: true });
    }

    // Helper function to create icon by compositing logo on transparent canvas
    async function createIcon(logoSize, outputPath, backgroundColor = null) {
      const padding = (ICON_SIZE - logoSize) / 2;
      const bg = backgroundColor || { r: 0, g: 0, b: 0, alpha: 0 };

      // Create a transparent/solid 1024x1024 canvas
      const canvas = sharp({
        create: {
          width: ICON_SIZE,
          height: ICON_SIZE,
          channels: 4,
          background: bg,
        },
      });

      // Resize logo to fit in safe zone
      const logo = await sharp(LOGO_PATH)
        .resize(logoSize, logoSize, {
          fit: 'contain',
          background: bg,
        })
        .toBuffer();

      // Composite logo onto canvas (centered)
      return canvas
        .composite([
          {
            input: logo,
            left: Math.round(padding),
            top: Math.round(padding),
          },
        ])
        .png()
        .toFile(outputPath);
    }

    // 1. Generate iOS/main icon (1024x1024)
    // iOS safe zone: ~10% padding on all sides (logo in middle 80%)
    const iosLogoSize = 820; // 1024 - (102 * 2) = 820px

    await createIcon(
      iosLogoSize,
      path.join(ASSETS_DIR, 'icon.png'),
      { r: 0, g: 0, b: 0, alpha: 0 } // Transparent
    );

    console.log('✅ Generated icon.png (iOS/main icon)');

    // 2. Generate Android adaptive icon foreground (1024x1024)
    // Android safe zone: logo should fit in middle 66% of canvas
    const androidLogoSize = 676; // 1024 - (174 * 2) = 676px

    await createIcon(
      androidLogoSize,
      path.join(ASSETS_DIR, 'adaptive-icon.png'),
      { r: 0, g: 0, b: 0, alpha: 0 } // Transparent
    );

    console.log('✅ Generated adaptive-icon.png (Android adaptive icon foreground)');

    // 3. Generate splash screen icon (1024x1024)
    // Splash icon: Logo centered on white background
    const splashLogoSize = 614; // ~60% of canvas

    await createIcon(
      splashLogoSize,
      path.join(ASSETS_DIR, 'splash-icon.png'),
      { r: 255, g: 255, b: 255, alpha: 1 } // White
    );

    console.log('✅ Generated splash-icon.png (splash screen icon)');

    // Verify dimensions
    const iconFiles = [
      { path: path.join(ASSETS_DIR, 'icon.png'), name: 'icon.png' },
      { path: path.join(ASSETS_DIR, 'adaptive-icon.png'), name: 'adaptive-icon.png' },
      { path: path.join(ASSETS_DIR, 'splash-icon.png'), name: 'splash-icon.png' },
    ];

    console.log('\n📏 Verifying icon dimensions...');
    for (const file of iconFiles) {
      const metadata = await sharp(file.path).metadata();
      const status = metadata.width === ICON_SIZE && metadata.height === ICON_SIZE ? '✅' : '❌';
      console.log(`${status} ${file.name}: ${metadata.width}x${metadata.height}`);
    }

    console.log('\n🎉 All icons generated successfully!');
    console.log(`📁 Icons saved to: ${ASSETS_DIR}`);
    console.log('\nGenerated files:');
    console.log('  - icon.png (1024x1024) - iOS/main icon');
    console.log('  - adaptive-icon.png (1024x1024) - Android adaptive icon foreground');
    console.log('  - splash-icon.png (1024x1024) - Splash screen icon');
  } catch (error) {
    console.error('❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

// Run the script
generateIcons();