import fs from 'node:fs';

globalThis.process ??= fs.watch('.');
