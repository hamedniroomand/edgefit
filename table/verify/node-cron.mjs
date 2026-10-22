// Reaches node:child_process.fork: a task that names a file runs in a child process, and start()
// forks the daemon that loads the file. On workerd, fork throws before the daemon starts. A runtime
// that has fork runs a task file that does nothing, and the script stops the task.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createTask } from 'node-cron';

export async function run() {
  const directory = mkdtempSync(path.join(tmpdir(), 'verify-'));
  try {
    const file = path.join(directory, 'task.mjs');
    writeFileSync(file, 'export function task() {}\n');
    const task = createTask('0 0 1 1 *', file);
    try {
      await task.start();
    } finally {
      await task.destroy();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
