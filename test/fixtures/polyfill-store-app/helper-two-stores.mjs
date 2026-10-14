import fs from 'node:fs';

function watch() {
  return fs.watch('.');
}

globalThis.fetch ??= watch;
globalThis.Bun ??= watch;
