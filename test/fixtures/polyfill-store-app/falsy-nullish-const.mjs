import fs from 'node:fs';

const value = globalThis.undefined;
export const watcher = value ?? fs.watch('.');
