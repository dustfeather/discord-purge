import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const r = spawnSync('npx', ['tsx', 'scripts/build.ts', '--target=userscript'], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.exit(r.status ?? 0);
