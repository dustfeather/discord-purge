import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'dist/firefox');
const OUT = resolve(ROOT, 'dist/firefox.xpi');

async function main() {
  await mkdir(resolve(ROOT, 'dist'), { recursive: true });
  const out = createWriteStream(OUT);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(out);
  archive.directory(SRC, false);
  await archive.finalize();
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
