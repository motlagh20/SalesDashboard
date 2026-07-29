import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function generateIcons() {
  const svgPath = path.join(process.cwd(), 'public', 'icon.svg');
  const publicDir = path.join(process.cwd(), 'public');

  if (!fs.existsSync(svgPath)) {
    console.error('SVG file not found!');
    return;
  }

  // 192x192
  await sharp(svgPath)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192.png'));

  // 512x512
  await sharp(svgPath)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512.png'));

  // 512x512 Maskable (with extra padding)
  await sharp(svgPath)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512.png'));

  // Apple Touch Icon 180x180
  await sharp(svgPath)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // Favicon 64x64
  await sharp(svgPath)
    .resize(64, 64)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));

  console.log('✅ PWA Icons generated successfully!');
}

generateIcons().catch(err => console.error('Error generating icons:', err));
