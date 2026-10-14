import fs from 'node:fs';

const g = globalThis;
g.fetch ??= fs.watch('.');
