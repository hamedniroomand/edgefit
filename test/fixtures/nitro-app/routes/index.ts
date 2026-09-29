import { watch } from 'node:fs';
import { withLock } from 'task-lock';

export default defineEventHandler(() => {
  watch('.', () => withLock('reload', () => 'changed'));
  return 'ok';
});
