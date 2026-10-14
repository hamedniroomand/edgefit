import fs from 'node:fs';

globalThis.fetch = globalThis.fetch ?? fs.watch('.');
