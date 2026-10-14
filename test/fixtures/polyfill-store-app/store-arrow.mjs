import fs from 'node:fs';

globalThis.fetch ??= () => fs.watch('.');
