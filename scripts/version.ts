import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function resolveVersion(): string {
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
