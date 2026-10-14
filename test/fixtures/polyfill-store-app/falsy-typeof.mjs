import fs from 'node:fs';

if (typeof globalThis.undefined === 'undefined') fs.watch('.');
