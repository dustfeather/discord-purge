import { build, context, type BuildOptions, type Plugin } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as sass from 'sass';
import { resolveVersion } from './version.ts';

type Target = 'chrome' | 'firefox' | 'userscript';

const args = process.argv.slice(2);
const target = (args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'chrome') as Target;
const watch = args.includes('--watch');
const firefoxLegacy = args.includes('--firefox-legacy');

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'src');
const DIST = resolve(ROOT, 'dist', target);
const VERSION = resolveVersion();

if (!['chrome', 'firefox', 'userscript'].includes(target)) {
  console.error(`Unknown target: ${target}`);
  process.exit(1);
}

const sassInlinePlugin: Plugin = {
  name: 'sass-inline',
  setup(b) {
    b.onResolve({ filter: /\.scss(\?inline)?$/ }, (a) => ({
      path: resolve(a.resolveDir, a.path.replace('?inline', '')),
      namespace: 'sass-inline',
    }));
    b.onLoad({ filter: /.*/, namespace: 'sass-inline' }, async (a) => {
      const result = sass.compile(a.path, { style: 'compressed' });
      return {
        contents: `export default ${JSON.stringify(result.css)};`,
        loader: 'js',
        watchFiles: result.loadedUrls.map((u) => u.pathname),
      };
    });
  },
};

const baseDefines: Record<string, string> = {
  __VERSION__: JSON.stringify(VERSION),
  __TARGET__: JSON.stringify(target),
  __FIREFOX_LEGACY__: JSON.stringify(firefoxLegacy),
  __USERSCRIPT__: JSON.stringify(target === 'userscript'),
};

async function clean() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
}

async function copyManifest() {
  const file = target === 'firefox' ? 'manifest.firefox.json' : 'manifest.chrome.json';
  const src = resolve(ROOT, 'manifest', file);
  const raw = await readFile(src, 'utf8');
  const manifest = JSON.parse(raw);
  manifest.version = VERSION;
  if (target === 'firefox' && firefoxLegacy) {
    manifest.content_scripts = (manifest.content_scripts as Array<{ world?: string }>).filter(
      (cs) => cs.world !== 'MAIN',
    );
    for (const cs of manifest.content_scripts as Array<{ world?: string }>) delete cs.world;
  }
  await writeFile(resolve(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

async function copyAsset(rel: string, destRel = rel) {
  const src = resolve(ROOT, rel);
  if (!existsSync(src)) return;
  const dest = resolve(DIST, destRel);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
}

async function copyIcons() {
  for (const size of [16, 32, 48, 128]) {
    await copyAsset(`assets/icons/icon-${size}.png`, `icons/icon-${size}.png`);
    await copyAsset(`assets/icons/icon-mono-${size}.png`, `icons/icon-mono-${size}.png`);
  }
  await copyAsset('assets/icons/favicon.ico', 'icons/favicon.ico');
}

async function copyPopup() {
  const html = await readFile(resolve(SRC, 'popup/popup.html'), 'utf8');
  await writeFile(resolve(DIST, 'popup.html'), html);
}

async function compilePopupCss() {
  const result = sass.compile(resolve(SRC, 'popup/popup.scss'), { style: 'compressed' });
  await writeFile(resolve(DIST, 'popup.css'), result.css);
}

const commonExtensionOptions: BuildOptions = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox128'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  define: baseDefines,
  plugins: [sassInlinePlugin],
  logLevel: 'info',
};

async function buildExtension() {
  await clean();
  await copyManifest();
  await copyIcons();
  await copyPopup();
  await compilePopupCss();

  const entries: Record<string, string> = {
    'auth-sniffer': resolve(SRC, 'injected/auth-sniffer.ts'),
    content: resolve(SRC, 'content/index.ts'),
    popup: resolve(SRC, 'popup/popup.ts'),
  };
  const bgEntry = { background: resolve(SRC, 'background/service-worker.ts') };
  const bgFormat: BuildOptions['format'] = target === 'chrome' ? 'esm' : 'iife';

  const restOpts: BuildOptions = {
    ...commonExtensionOptions,
    entryPoints: entries,
    outdir: DIST,
    entryNames: '[name]',
  };

  const bgOpts: BuildOptions = {
    ...commonExtensionOptions,
    entryPoints: bgEntry,
    outdir: DIST,
    entryNames: '[name]',
    format: bgFormat,
  };

  if (watch) {
    const ctx1 = await context(restOpts);
    const ctx2 = await context(bgOpts);
    await Promise.all([ctx1.watch(), ctx2.watch()]);
    console.log(`[build] watching ${target} -> ${DIST}`);
  } else {
    await build(restOpts);
    await build(bgOpts);
    console.log(`[build] ${target} -> ${DIST} (v${VERSION})`);
  }
}

async function buildUserscript() {
  await mkdir(resolve(ROOT, 'dist'), { recursive: true });
  const out = resolve(ROOT, 'dist', 'discord-purge.user.js');
  await rm(out, { force: true });
  const entry = resolve(SRC, 'content/index.ts');

  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120', 'firefox128'],
    minify: false,
    define: baseDefines,
    plugins: [sassInlinePlugin],
    write: false,
    logLevel: 'info',
  });

  const body = result.outputFiles?.[0]?.text ?? '';
  const header = [
    '// ==UserScript==',
    `// @name         discord-purge`,
    `// @namespace    https://github.com/dustfeather/discord-purge`,
    `// @version      ${VERSION}`,
    `// @description  Bulk-unsend your own messages from Discord DMs.`,
    `// @author       dustfeather`,
    `// @match        https://discord.com/channels/@me/*`,
    `// @run-at       document-start`,
    `// @grant        none`,
    `// @license      GPL-3.0-only`,
    '// ==/UserScript==',
    '',
  ].join('\n');

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${header}\n${body}`);
  console.log(`[build] userscript -> ${out} (v${VERSION})`);
}

async function main() {
  if (target === 'userscript') return buildUserscript();
  return buildExtension();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
