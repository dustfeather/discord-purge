import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Resolve the build version, in order of preference:
 *   1. DISCORD_PURGE_VERSION env (CI release-job derived).
 *   2. GITHUB_REF_NAME with leading "v" stripped (manual tag-push fallback).
 *   3. Latest annotated git tag minus the leading "v".
 *   4. package.json version.
 *   5. "0.0.0".
 */
export function resolveVersion(): string {
  const explicit = process.env['DISCORD_PURGE_VERSION'];
  if (explicit && /^\d/.test(explicit)) return explicit.replace(/^v/, '');

  const ref = process.env['GITHUB_REF_NAME'];
  if (ref && /^v\d/.test(ref)) return ref.replace(/^v/, '');

  try {
    const tag = execSync('git describe --tags --abbrev=0', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (/^v\d/.test(tag)) return tag.replace(/^v/, '');
  } catch {
    // ignore
  }

  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    if (typeof pkg.version === 'string' && pkg.version) return pkg.version;
  } catch {
    // ignore
  }

  return '0.0.0';
}
