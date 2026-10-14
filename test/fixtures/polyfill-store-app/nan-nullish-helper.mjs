import fs from 'node:fs';

function has() {
  return globalThis.NaN;
}
export const watcher = has() ?? fs.watch('.');
