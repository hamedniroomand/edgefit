import fs from 'node:fs';

globalThis.Bun ??= fs.watch('.');
