import fs from 'node:fs';

let g = globalThis;
g.fetch ??= fs.watch('.');
