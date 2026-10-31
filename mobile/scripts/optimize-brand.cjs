// Preparation-only image tooling; this adds no mobile runtime dependency.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(require.resolve('sharp', {
  paths: [path.join(__dirname, '../../output/branding-tools'), __dirname],
}));
const assets = path.join(__dirname, '../assets');

async function main() {
  // Read both sources before replacing anything. Optional source directory keeps
  // full-resolution originals outside the app's asset graph.
  const source = process.argv[2] ? path.resolve(process.argv[2]) : assets;
  const icon = await fs.readFile(path.join(source, 'brand-icon.png'));
  const adaptive = await fs.readFile(path.join(source, 'brand-adaptive.png'));
  for (const buffer of [icon, adaptive]) {
    const { width, height } = await sharp(buffer).metadata();
    if (width < 1024 || height !== width) {
      throw new Error('Brand sources must be square and at least 1024px.');
    }
  }
  const exports = [
    ['brand-icon.png', icon, 1024],
    ['brand-adaptive.png', adaptive, 1024],
    ['brand-splash.png', icon, 540],
    ['brand-favicon.png', icon, 64],
    ['brand-logo.jpg', icon, 384],
  ];
  for (const [name, original, size] of exports) {
    const image = sharp(original).resize(size, size, { kernel: 'lanczos3' }).flatten({ background: '#eeeeee' });
    if (name.endsWith('.jpg')) {
      image.jpeg({ quality: 85, mozjpeg: true });
    } else {
      image.png({ palette: true, colours: 256, quality: 90, effort: 10, compressionLevel: 9, dither: 0.5 });
    }
    await image.toFile(path.join(assets, name));
    const { size: bytes } = await fs.stat(path.join(assets, name));
    console.log(`${name}: ${size}x${size}, ${bytes} bytes`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
