import fs from 'node:fs';

export const watcher = globalThis.NaN ?? fs.watch('.');
