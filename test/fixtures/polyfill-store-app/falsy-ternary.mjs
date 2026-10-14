import fs from 'node:fs';

export const watcher = globalThis.NaN ? undefined : fs.watch('.');
