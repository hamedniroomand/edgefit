import fs from 'node:fs';

globalThis.Bun = globalThis.Bun ?? fs.watch('.');
