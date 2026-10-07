// Runs an entry with a runtime's own command and module resolution, as Bun and Deno do.
import { spawnSync } from 'node:child_process';

import { resultOf } from '../entry.mjs';

export const timeoutMs = 60 * 1000;

const tail = text => (text ?? '').trim().split('\n').slice(-2).join(' ');

/** Runs `command args` in the folder of the entry, and reads the result that the entry prints. */
export function runScript(command, args, directory) {
  const run = spawnSync(command, args, { cwd: directory, encoding: 'utf8', timeout: timeoutMs });
  if (run.error?.code === 'ETIMEDOUT') {
    return { failure: 'timeout' };
  }
  const result = resultOf(run.stdout ?? '');
  return result === undefined
    ? { failure: `no result: ${run.error?.message ?? tail(run.stderr)}` }
    : { run: result };
}

/** The version that `command --version` prints: `1.4.2`, or `deno 2.9.7 (stable, …)`. */
export function versionOf(command) {
  const run = spawnSync(command, ['--version'], { encoding: 'utf8' });
  const words = (run.stdout ?? '').split('\n')[0].trim().split(' ');
  return (words[0] === command ? words[1] : words[0]) || 'unknown';
}
