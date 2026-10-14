import fs from 'node:fs';

function setup() {
  const g = globalThis;
  g.fetch ??= fs.watch('.');
}

setup();
