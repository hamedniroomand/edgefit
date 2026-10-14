import fs from 'node:fs';

const g = globalThis;
{
  let g = globalThis;
  g.fetch ??= fs.watch('.');
}
