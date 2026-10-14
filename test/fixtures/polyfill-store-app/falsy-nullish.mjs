import fs from 'node:fs';

export const watcher = globalThis.undefined ?? fs.watch('.');
