import fs from 'node:fs';

if (globalThis.NaN) {
  console.log('set');
} else {
  fs.watch('.');
}
