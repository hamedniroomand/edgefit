import fs from 'node:fs';

function watch() {
  return fs.watch('.');
}

globalThis.Bun ??= watch;
