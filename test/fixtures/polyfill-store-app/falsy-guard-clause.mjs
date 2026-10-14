import fs from 'node:fs';

export function watch() {
  if (globalThis.NaN) return undefined;
  return fs.watch('.');
}

watch();
