import { watch } from 'chokidar';

export function reload(): void {
  watch('.');
}
