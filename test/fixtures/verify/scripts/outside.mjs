import { FSWatcher } from 'chokidar';

export async function run() {
  return new FSWatcher();
}
