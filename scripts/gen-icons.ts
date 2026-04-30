import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'assets/icons/source.svg');
const SRC_MONO = resolve(ROOT, 'assets/icons/source-mono.svg');
const OUT = resolve(ROOT, 'assets/icons');

const SIZES = [16, 32, 48, 128, 192, 512];

async function rasterize(svgPath: string, prefix: string) {
  const svg = await readFile(svgPath);
  for (const size of SIZES) {
    const buf = await sharp(svg, { density: 384 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();
    const outFile = resolve(OUT, `${prefix}-${size}.png`);
    await sharp(buf).toFile(outFile);
    console.log(`wrote ${outFile}`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await rasterize(SRC, 'icon');
  await rasterize(SRC_MONO, 'icon-mono');

  const buf = await sharp(await readFile(SRC), { density: 384 }).resize(32, 32).png().toBuffer();
  await sharp(buf).toFile(resolve(OUT, 'favicon.ico'));
  console.log('wrote favicon.ico (PNG-encoded)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
