import fs from 'node:fs';

globalThis.undefined ??= fs.watch('.');
