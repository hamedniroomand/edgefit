import { watch as fsWatch } from 'node:fs';

export function watch(path) {
  return fsWatch(path);
}
