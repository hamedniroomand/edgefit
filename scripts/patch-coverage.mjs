// Checks the coverage of the `src/` lines this branch adds, as Codecov does for a pull request.
// Run `vp test --coverage` first: it writes coverage/lcov.info.
// Usage: node scripts/patch-coverage.mjs [base-ref] [minimum-percent]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const base = process.argv[2] ?? 'origin/main';
const minimum = Number(process.argv[3] ?? 80);
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

/** Added lines of each `src/` file, by file. Reads the hunk headers: `@@ -a,b +start,count @@`. */
function addedLines(diff) {
  const added = new Map();
  let file;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.startsWith('+++ b/') ? line.slice(6) : undefined;
    } else if (file !== undefined && line.startsWith('@@')) {
      const [, start, count = '1'] = /\+(\d+)(?:,(\d+))?/u.exec(line) ?? [];
      const lines = added.get(file) ?? new Set();
      for (let offset = 0; offset < Number(count); offset += 1) {
        lines.add(Number(start) + offset);
      }
      added.set(file, lines);
    }
  }
  return added;
}

/** Hits of each line that holds code, by file, from the `SF:` and `DA:line,hits` records. */
function lineHits(lcov) {
  const hits = new Map();
  let file;
  for (const line of lcov.split('\n')) {
    if (line.startsWith('SF:')) {
      file = path.resolve(root, line.slice(3));
      hits.set(file, new Map());
    } else if (file !== undefined && line.startsWith('DA:')) {
      const [number, count] = line.slice(3).split(',');
      hits.get(file).set(Number(number), Number(count));
    }
  }
  return hits;
}

let mergeBase;
try {
  mergeBase = git('merge-base', 'HEAD', base).trim();
} catch {
  console.log(`patch coverage: no ${base} to compare with, so it was skipped.`);
  process.exit(0);
}

const diff = git('diff', '-U0', '--diff-filter=AM', mergeBase, '--', 'src/**/*.ts');
const added = addedLines(diff);
const hits = lineHits(readFileSync(path.join(root, 'coverage/lcov.info'), 'utf8'));

let coverable = 0;
let covered = 0;
const missing = [];
for (const [file, lines] of added) {
  const counts = hits.get(path.join(root, file));
  for (const line of [...lines].sort((a, b) => a - b)) {
    const count = counts?.get(line);
    if (count === undefined) {
      continue;
    }
    coverable += 1;
    if (count > 0) {
      covered += 1;
    } else {
      missing.push(`${file}:${line}`);
    }
  }
}

if (coverable === 0) {
  console.log('patch coverage: no changed lines of code in src/.');
  process.exit(0);
}
const percent = (covered / coverable) * 100;
console.log(
  `patch coverage: ${percent.toFixed(2)}% (${covered} of ${coverable} changed lines) against ${base}`,
);
if (missing.length > 0) {
  console.log(`not covered:\n  ${missing.join('\n  ')}`);
}
if (percent < minimum) {
  console.error(
    `patch coverage is below ${minimum}%. Add tests or delete the code, then push again.`,
  );
  process.exit(1);
}
