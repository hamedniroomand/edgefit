import fs from 'node:fs';

let g = globalThis;
g = {};
g.fetch ??= fs.watch('.');
