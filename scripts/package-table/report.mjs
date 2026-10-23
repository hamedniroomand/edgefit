// Usage: node report.mjs <added.txt> <results-dir> [--markdown <file>]
// Reads the result of `edgefit package --format json` for each package that a pull request adds,
// writes a Markdown report of the results, and exits with 1 for a row that has no result, or that
// fails or cannot be checked on a target and has no `notes` field. A row that fails on purpose
// carries `notes`. The exit code is 2 for a wrong call.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { fileNameOf, readList } from './list.mjs';

/** The first line of the report. The workflow finds its comment by this line. */
export const marker = '<!-- package-list -->';

const marks = { pass: '✓', warn: '⚠', fail: '✗', error: '?', unchecked: '–' };
const maxResults = 10;
const maxApis = 3;
// GitHub allows 65,536 characters in a comment.
const maxLength = 60_000;
const noResultAdvice =
  'A notes field cannot clear this. Run the job again, and open an issue if it fails again.';

/** The text of a workflow command: GitHub reads a percent sign and a line break in it. */
export const escapeCommand = text =>
  text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

/** The text of a file, or `undefined` when the file is not there. */
function readOrNothing(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return undefined;
    }
    throw error;
  }
}

/**
 * The result of one package. `problem` says why there is none: the CLI wrote no file, or a file
 * that is not a result. The tail of the error output of the CLI comes with it, as code, so that a
 * name with `@` mentions nobody. The text has no package name: the caller adds it.
 * @param {string} directory
 * @param {string} name
 * @returns {{ result: any } | { problem: string }}
 */
export function resultOf(directory, name) {
  const base = path.join(directory, fileNameOf(name));
  const text = readOrNothing(`${base}.json`);
  const errors = (readOrNothing(`${base}.err`) ?? '').trim().split('\n').slice(-3).join(' ');
  const cause = errors === '' ? '' : ` \`${errors.replaceAll('`', "'")}\``;
  const problem = reason => ({ problem: `${reason}${cause} ${noResultAdvice}` });
  if (text === undefined || text.trim() === '') {
    return problem('edgefit gave no result.');
  }
  try {
    const result = JSON.parse(text);
    if (typeof result?.summary !== 'object' || result.summary === null) {
      return problem('the result has no summary.');
    }
    // The runner of the table writes this shape for a package that timed out or did not install.
    if (typeof result.error === 'string') {
      return problem(`edgefit could not check it: ${result.error}`);
    }
    return { result };
  } catch {
    return problem('the result is not JSON.');
  }
}

/** Whether the row says why it fails: a `notes` field with text. */
const hasNotes = row => typeof row?.notes === 'string' && row.notes.trim() !== '';

/** The text as code on one line, so that a mention or a line break in it does no harm. */
const asCode = text => `\`${text.replace(/\s+/gu, ' ').replaceAll('`', "'")}\``;

/** The distinct names in a list, as code, at most `maxApis` of them. */
function codeList(names) {
  const distinct = [...new Set(names)];
  const shown = distinct.slice(0, maxApis).map(asCode);
  return `${shown.join(', ')}${distinct.length > maxApis ? `, and ${distinct.length - maxApis} more` : ''}`;
}

/** What a cell says: the APIs of its findings, or its message when it could not be checked. */
function detailOf(cell, levels) {
  if (cell === undefined) {
    return '';
  }
  if (cell.status === 'error' || cell.status === 'unchecked') {
    return cell.message === undefined ? '' : asCode(cell.message);
  }
  return codeList(
    (cell.findings ?? []).filter(finding => levels.includes(finding.level)).map(item => item.api),
  );
}

/**
 * The cell that decides the mark of a target, as `targetResult` of src/package/result.ts decides
 * it: the main entry, unless that entry is missing or could not be checked. Then the worst cell
 * decides, and `fallback` is true.
 */
function decidingCell(result, target, main) {
  const found = (result.entries ?? []).flatMap(entry =>
    entry.results?.[target] === undefined
      ? []
      : [{ subpath: entry.subpath, cell: entry.results[target] }],
  );
  const mainCell = found.find(item => item.subpath === main);
  if (mainCell !== undefined && mainCell.cell.status !== 'unchecked') {
    return { ...mainCell, fallback: false };
  }
  const worst = found.find(item => item.cell.status === result.summary[target]);
  // `summary` is `error` when no entry could be checked: no cell has that status.
  const none = found.length > 0 && worst === undefined;
  return { subpath: main, cell: undefined, ...(none ? found[0] : worst), fallback: true, none };
}

/**
 * The problems of one row, as text without the name. The mark of a row on a target is `summary`.
 * It is the result of the main entry. Another subpath that fails, such as `hono/bun` on workerd,
 * does not make the row fail. Only a pass and a warning are accepted: any other status, such as
 * `error` for an entry that threw, means that the row fails or cannot be checked.
 * @param {any} result
 * @param {{ notes?: unknown, main?: string } | undefined} row
 * @returns {string[]}
 */
export function problemsOf(result, row) {
  if (hasNotes(row)) {
    return [];
  }
  const main = row?.main ?? '.';
  return Object.entries(result.summary)
    .filter(([, status]) => status !== 'pass' && status !== 'warn')
    .map(([target, status]) => {
      const { subpath, cell, fallback, none } = decidingCell(result, target, main);
      const detail = detailOf(cell, ['error']);
      const where = none
        ? `no entry could be checked, such as \`${subpath}\``
        : fallback
          ? `\`${subpath}\``
          : `main entry \`${main}\``;
      const what = status === 'fail' ? 'fails' : 'cannot be checked';
      const fallbackText =
        fallback && !none
          ? ` The row has no checked main entry \`${main}\`, so its worst result decides. A main field can name the entry that the row stands for.`
          : '';
      return `${what} on ${target} (${where}${detail === '' ? '' : `: ${detail}`}) and the row has no notes.${fallbackText} Add a notes field that says why.`;
    });
}

/** The results of a row that are not a pass, as `subpath target mark (what)`. */
function otherResults(result) {
  return (result.entries ?? []).flatMap(entry =>
    Object.entries(entry.results ?? {})
      .filter(([, cell]) => cell.status !== 'pass')
      .map(([target, cell]) => {
        const detail = detailOf(cell, ['error', 'warning']);
        return `\`${entry.subpath}\` ${target} ${marks[cell.status] ?? cell.status}${detail === '' ? '' : ` (${detail})`}`;
      }),
  );
}

/** The exports that fail or warn while the main entry does not, as `export of subpath target mark`. */
function worstExports(result) {
  return Object.entries(result.worstExport ?? {}).map(
    ([target, item]) =>
      `${asCode(item.name)} of ${asCode(item.subpath)} ${target} ${marks[item.status] ?? item.status}`,
  );
}

/**
 * The report of the rows, as Markdown that starts with the marker.
 * @param {{ name: string, result?: any, notes: boolean, problems?: string[], problem?: string }[]} items
 * @returns {string}
 */
export function markdownOf(items) {
  const targets = [...new Set(items.flatMap(item => Object.keys(item.result?.summary ?? {})))];
  const lines = [
    marker,
    '**Package list**: the result of `edgefit package` for each row that this pull request adds.',
    '',
    `| Package | ${[...targets, 'Notes', 'Job'].join(' | ')} |`,
    `|${Array.from({ length: targets.length + 3 }, () => '---').join('|')}|`,
  ];
  for (const item of items) {
    const version = item.result?.resolved === undefined ? '' : `@${item.result.resolved}`;
    const cells = targets.map(target => marks[item.result?.summary?.[target]] ?? '?');
    const failed = item.problem !== undefined || (item.problems ?? []).length > 0;
    lines.push(
      `| \`${item.name}${version}\` | ${[...cells, item.notes ? 'yes' : 'no', failed ? 'fails' : 'passes'].join(' | ')} |`,
    );
  }
  lines.push(
    '',
    '✓ pass, ⚠ warning, ✗ fail, ? could not be checked, – not checked. Each mark is the result of the main entry of the row, or of its worst entry when the main entry could not be checked. Notes: the row has a `notes` field that says why it fails. Job: the Package list job fails for a row that fails or cannot be checked and has no notes, and for a row that has no result.',
  );
  for (const item of items) {
    if (item.problem !== undefined) {
      lines.push('', `- \`${item.name}\`: ${item.problem}`);
      continue;
    }
    for (const problem of item.problems ?? []) {
      lines.push('', `- \`${item.name}\` ${problem}`);
    }
    const exported = worstExports(item.result);
    if (exported.length > 0) {
      lines.push(
        '',
        `\`${item.name}\`: an export that is worse than the main entry (export, subpath, target): ${exported.join(', ')}. The job does not fail for it.`,
      );
    }
    const others = otherResults(item.result);
    if (others.length > 0) {
      const more = others.length > maxResults ? `, and ${others.length - maxResults} more` : '';
      lines.push(
        '',
        `\`${item.name}\`: results that are not ✓ (subpath, target): ${others.slice(0, maxResults).join(', ')}${more}.`,
      );
    }
  }
  const text = `${lines.join('\n')}\n`;
  return text.length <= maxLength
    ? text
    : `${text.slice(0, maxLength)}\n\n_The report is cut: it is longer than GitHub allows for a comment._\n`;
}

/**
 * The report for the added names, and the problems that make the job fail, each with the name.
 * @param {string[]} names
 * @param {string} directory
 * @param {readonly { name: string, notes?: unknown, main?: string }[]} rows
 */
export function reportOf(names, directory, rows) {
  const items = [];
  const problems = [];
  for (const name of names) {
    const row = rows.find(entry => entry.name === name);
    const found = resultOf(directory, name);
    if ('problem' in found) {
      items.push({ name, notes: hasNotes(row), problem: found.problem });
      problems.push(`${name}: ${found.problem}`);
    } else {
      const own = problemsOf(found.result, row);
      items.push({ name, result: found.result, notes: hasNotes(row), problems: own });
      problems.push(...own.map(text => `${name} ${text}`));
    }
  }
  return { markdown: markdownOf(items), problems };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [addedFile, directory, flag, markdownFile] = process.argv.slice(2);
  if (
    directory === undefined ||
    (flag !== undefined && (flag !== '--markdown' || markdownFile === undefined))
  ) {
    console.error('Usage: node report.mjs <added.txt> <results-dir> [--markdown <file>]');
    process.exit(2);
  }
  const names = readFileSync(addedFile, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '');
  if (names.length > 0) {
    const { markdown, problems } = reportOf(names, directory, readList());
    if (flag === '--markdown') {
      writeFileSync(markdownFile, markdown);
    }
    for (const problem of problems) {
      console.log(`::error title=Package list::${escapeCommand(problem)}`);
    }
    process.exitCode = problems.length > 0 ? 1 : 0;
  }
}
