// Installs one package at the version of its result, with its install scripts, in its own folder.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const timeoutMs = 5 * 60 * 1000;

/** Installs `name@version` in `<work>/<file>/`. Returns the folder, or an error message. */
export function install(work, file, name, version) {
  const directory = path.join(work, file);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module', dependencies: { [name]: version } })}\n`,
  );
  const run = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  if (run.status === 0) {
    return { directory };
  }
  const detail = run.error?.message ?? run.stderr.trim().split('\n').slice(-2).join(' ');
  return { error: `npm install failed: ${detail || 'no output'}` };
}
