import fs from 'node:fs';

if (!globalThis.NaN) globalThis.NaN = fs.watch('.');
