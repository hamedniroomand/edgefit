import fs from 'node:fs';

export function watchAlways() {
  return fs.watch('..');
}
