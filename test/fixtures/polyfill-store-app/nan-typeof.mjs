import fs from 'node:fs';

if (typeof globalThis.NaN === 'undefined') fs.watch('.');
