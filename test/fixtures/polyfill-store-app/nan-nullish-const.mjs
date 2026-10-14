import fs from 'node:fs';

const value = globalThis.NaN;
export const watcher = value ?? fs.watch('.');
