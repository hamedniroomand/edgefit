// Imports Node.js modules at the top and only uses them on Node.js, the way libraries built for
// Next.js do. Next's edge build replaces the import with a stand-in that throws when it is used.
import fs from 'node:fs';
import { readFileSync, watch } from 'node:fs';

export function read(): string {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    watch('.');
    return fs.readFileSync('a', 'utf8') + readFileSync('b', 'utf8');
  }
  return '';
}

export function readUnguarded(): string {
  return fs.statSync('c').isFile() ? 'file' : '';
}
