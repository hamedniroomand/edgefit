import fs from 'node:fs';

let g = globalThis;
if (globalThis.other) g = {};
g.fetch ??= fs.watch('.');
