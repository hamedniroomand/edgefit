import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

// Many tests make a temp folder with mkdtemp and do not delete it. This setup puts all of these
// folders in one root folder and deletes the root at the end of the run. A killed run leaves the
// root folder.
const names = ['TMPDIR', 'TEMP', 'TMP'];

export function setup(): () => void {
  const before = names.map(name => process.env[name]);
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-test-'));
  // os.tmpdir() reads these on each call, and the workers and their child processes inherit them.
  for (const name of names) {
    process.env[name] = root;
  }
  return () => {
    try {
      // Watch mode runs setup again after a config change, so it must not see the deleted root.
      for (const [index, name] of names.entries()) {
        const value = before[index];
        if (value === undefined) {
          Reflect.deleteProperty(process.env, name);
        } else {
          process.env[name] = value;
        }
      }
    } finally {
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3 });
      } catch (error) {
        // A failed delete, such as EBUSY on Windows, must not fail a run that passed.
        process.emitWarning(`Cannot delete a temp folder: ${(error as Error).message}`);
      }
    }
  };
}
