// Reaches node:fs.watch: chokidar starts to watch the directory before it reports `ready`.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { watch } from 'chokidar';

export async function run() {
  const watcher = watch(mkdtempSync(path.join(tmpdir(), 'verify-')), { persistent: false });
  try {
    await new Promise((resolve, reject) => {
      watcher.on('ready', resolve).on('error', reject);
    });
  } finally {
    await watcher.close();
  }
}
