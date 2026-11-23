import fs from 'node:fs';

function watch() {
  globalThis.Bun ??= fs.watch('.');
}

globalThis.fetch ??= watch;
