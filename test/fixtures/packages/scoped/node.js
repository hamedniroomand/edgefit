import { watch } from 'node:fs';
import { unusedByEntry } from './unused.js';

export function watchIt(path) {
  return watch(path);
}
export { unusedByEntry };
