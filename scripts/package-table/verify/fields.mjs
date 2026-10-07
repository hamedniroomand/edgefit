// The `verified` fields that the merge step adds to a package result and to its row.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Reads `<directory>/verify-<runtime>/<file>.json`, the output of each verify job, by file. */
export function readVerify(directory) {
  const runs = new Map();
  if (directory === undefined || !existsSync(directory)) {
    return runs;
  }
  for (const job of readdirSync(directory)) {
    for (const name of readdirSync(path.join(directory, job)).filter(item =>
      item.endsWith('.json'),
    )) {
      const run = JSON.parse(readFileSync(path.join(directory, job, name), 'utf8'));
      runs.set(name.slice(0, -'.json'.length), [
        ...(runs.get(name.slice(0, -'.json'.length)) ?? []),
        run,
      ]);
    }
  }
  return runs;
}

const published = new Set(['verified', 'confirmed']);

/**
 * The verification of a package result: a `verified` or `confirmed` cell for each runtime that
 * ran the same version. A mismatch and an absent cell are left out.
 */
export function verifiedOf(runs, resolved) {
  const cells = runs
    .filter(run => run.resolved === resolved && published.has(run.cell.outcome))
    .map(({ runtime, version, cell }) => [
      runtime,
      {
        outcome: cell.outcome,
        kind: cell.kind,
        runtime: `${runtime} ${version}`,
        ...(cell.error === undefined ? {} : { error: cell.error }),
        ...(cell.api === undefined ? {} : { api: cell.api }),
      },
    ]);
  return cells.length === 0 ? undefined : Object.fromEntries(cells);
}

/** The outcomes alone, for the row in results.json. */
export function verifiedRow(verified) {
  return Object.fromEntries(
    Object.entries(verified).map(([runtime, cell]) => [runtime, cell.outcome]),
  );
}
