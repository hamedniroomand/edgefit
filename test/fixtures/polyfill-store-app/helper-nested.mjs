import fs from 'node:fs';

function watch() {
  return fs.watch('.');
}

globalThis.fetch ??= { x: (globalThis.Bun ??= watch) };
