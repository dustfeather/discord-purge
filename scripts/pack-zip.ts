// Package dist/chrome into the canonical release artifact the shared
// release-extension workflow collects: dist-artifacts/<base>-chrome-<tag>.zip
// base/tag come from the workflow env (BASE/TAG); local dev falls back to the
// repo base name and the resolved build version.
import { ZipArchive } from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveVersion } from './version.ts';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'dist/chrome');
const OUTDIR = resolve(ROOT, 'dist-artifacts');

const base = process.env['BASE'] || 'discord-purge';
const tag = process.env['TAG'] || `v${resolveVersion()}`;
const OUT = resolve(OUTDIR, `${base}-chrome-${tag}.zip`);

async function main() {
  await mkdir(OUTDIR, { recursive: true });
  await rm(OUT, { force: true });
  const out = createWriteStream(OUT);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const done = new Promise<void>((res, rej) => {
    out.on('close', () => res());
    out.on('error', rej);
    archive.on('error', rej);
  });
  archive.pipe(out);
  archive.directory(SRC, false);
  await archive.finalize();
  await done;
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
