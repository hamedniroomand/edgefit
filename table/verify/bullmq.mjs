// Reaches node:child_process.fork: a pool of child processes forks one when a job runs in a
// separate file. On workerd, fork throws before the child starts. A runtime that has fork starts
// the child, which loads a processor file that does nothing, and the script stops the child.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { ChildPool } from 'bullmq';

export async function run() {
  const directory = mkdtempSync(path.join(tmpdir(), 'verify-'));
  // The default main file is in the current folder, not in the package.
  const pool = new ChildPool({
    mainFile: path.join(process.cwd(), 'node_modules/bullmq/dist/cjs/classes/main.js'),
  });
  try {
    const processor = path.join(directory, 'processor.mjs');
    writeFileSync(processor, 'export default async function () {}\n');
    await pool.retain(processor);
  } finally {
    await pool.clean();
    rmSync(directory, { recursive: true, force: true });
  }
}
