// Place the built userscript at the canonical release artifact path the shared
// release-extension workflow collects: dist-artifacts/<base>-userscript-<tag>.user.js
// The userscript itself is produced by `build.ts --target=userscript`, which
// writes dist/discord-purge.user.js; this step just names + copies it.
// base/tag come from the workflow env (BASE/TAG); local dev falls back to the
// repo base name and the resolved build version.
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveVersion } from './version.ts';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'dist/discord-purge.user.js');
const OUTDIR = resolve(ROOT, 'dist-artifacts');

const base = process.env['BASE'] || 'discord-purge';
const tag = process.env['TAG'] || `v${resolveVersion()}`;
const OUT = resolve(OUTDIR, `${base}-userscript-${tag}.user.js`);

async function main() {
  await mkdir(OUTDIR, { recursive: true });
  await rm(OUT, { force: true });
  await copyFile(SRC, OUT);
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
