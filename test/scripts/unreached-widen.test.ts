import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  applyWidening,
  changedGuards,
  changesetText,
  guardNote,
  listLimit,
  missingGuards,
  newestRange,
  pullRequestBody,
  widenPlan,
  widenedText,
} from '@scripts/unreached/widen.mjs';
import { describe, expect, it, vi } from 'vite-plus/test';

import { inRange } from '@/data/version-range.ts';

const releases = path.join(import.meta.dirname, '../fixtures/unreached');
const last = path.join(releases, 'last');
const identical = { version: '1.0.1', root: path.join(releases, 'identical') };
const changed = { version: '1.0.2', root: path.join(releases, 'changed') };
const folder = { version: '1.0.3', root: path.join(releases, 'dirlike') };

function entry(file: string, max?: string, name = 'fixture') {
  return {
    package: name,
    versions: { min: '1.0.0', ...(max === undefined ? {} : { max }) },
    file,
  };
}

describe('the newest range of the entries of a package', () => {
  it('holds the entries with the greatest max, not an older range or an open one', () => {
    const newest = [entry('a.js', '1.0.0'), entry('b.js', '1.0.0')];
    expect(newestRange([entry('old.js', '0.9.0'), ...newest, entry('open.js')])).toEqual(newest);
  });

  it('is empty when no entry has a max', () => {
    expect(newestRange([entry('open.js')])).toEqual([]);
  });
});

describe('widening a range on its own', () => {
  const gate = entry('dist/gate.js', '1.0.0');
  const run = entry('dist/run.js', '1.0.0');

  it('widens when every named file has the same bytes in the latest release', () => {
    const plan = widenPlan([gate, run], identical, () => last);
    expect(plan).toMatchObject({ name: 'fixture', from: '1.0.0', to: '1.0.1' });
    expect(plan?.entries).toEqual([gate, run]);
    expect(plan?.changedFiles).toEqual(['package.json']);
  });

  it('makes the latest release part of the range after it is applied', () => {
    const entries = [entry('dist/gate.js', '1.0.0')];
    const plan = widenPlan(entries, identical, () => last);
    expect(entries.some(item => inRange('1.0.1', item.versions))).toBe(false);
    applyWidening(plan!);
    expect(entries.every(item => inRange('1.0.1', item.versions))).toBe(true);
  });

  it('does not widen when one named file changed, and the other did not', () => {
    expect(widenPlan([gate, run], changed, () => last)).toBeUndefined();
  });

  it('widens when only unchanged files are named, and lists each file that differs', () => {
    expect(widenPlan([gate], changed, () => last)?.changedFiles).toEqual([
      'dist/new.js',
      'dist/run.js',
      'package.json',
    ]);
  });

  it.each([
    ['in the release before', changed, 'dist/new.js'],
    ['in both releases', changed, 'dist/none.js'],
    ['as a file, where the other release has a folder', folder, 'dist/run.js'],
  ])('does not widen when a named file is missing %s', (_name, latest, file) => {
    expect(widenPlan([entry(file, '1.0.0')], latest, () => last)).toBeUndefined();
  });

  it('counts a path that is a file in one release and a folder in the other as a difference', () => {
    expect(widenPlan([gate], folder, () => last)?.changedFiles).toEqual([
      'dist/run.js',
      'dist/run.js/inner.js',
      'package.json',
    ]);
  });

  it('widens only the newest range, and reads only its files', () => {
    const older = entry('dist/run.js', '0.9.0');
    expect(widenPlan([older, gate], changed, () => last)?.entries).toEqual([gate]);
  });
});

describe('guard files of an entry', () => {
  const guarded = (file: string, ...guards: string[]) => ({
    ...entry(file, '1.0.0'),
    guards,
  });

  it('widens when the named file and each guard file have the same bytes', () => {
    const entries = [guarded('dist/gate.js', 'dist/run.js')];
    expect(widenPlan(entries, identical, () => last)).toMatchObject({ from: '1.0.0', to: '1.0.1' });
    expect(changedGuards(entries, identical, () => last)).toBeUndefined();
  });

  it('does not widen when only a guard file changed, and names that file only', () => {
    // In the changed release, gate.js has the same bytes and run.js has other bytes.
    const entries = [guarded('dist/gate.js', 'dist/gate.js', 'dist/run.js')];
    expect(widenPlan(entries, changed, () => last)).toBeUndefined();
    expect(changedGuards(entries, changed, () => last)).toEqual({
      from: '1.0.0',
      files: ['dist/run.js'],
    });
  });

  it.each([
    ['is missing in both releases', changed, 'dist/none.js'],
    ['is missing in the release before', changed, 'dist/new.js'],
    ['is a folder in the latest release', folder, 'dist/run.js'],
  ])('does not widen when a guard file %s', (_name, latest, guard) => {
    const entries = [guarded('dist/gate.js', guard)];
    expect(widenPlan(entries, latest, () => last)).toBeUndefined();
    expect(changedGuards(entries, latest, () => last)).toEqual({ from: '1.0.0', files: [guard] });
  });

  it('names a guard file once, also when two entries list it', () => {
    const entries = [
      guarded('dist/gate.js', 'dist/run.js'),
      guarded('dist/other.js', 'dist/run.js'),
    ];
    expect(changedGuards(entries, changed, () => last)?.files).toEqual(['dist/run.js']);
  });

  it('names no guard file when a named file changed and each guard file did not', () => {
    const entries = [guarded('dist/run.js', 'dist/gate.js')];
    expect(widenPlan(entries, changed, () => last)).toBeUndefined();
    expect(changedGuards(entries, changed, () => last)).toBeUndefined();
  });

  it('reads the guard files of the newest range only', () => {
    const older = {
      ...guarded('dist/run.js', 'dist/none.js'),
      versions: { min: '0.1.0', max: '0.9.0' },
    };
    const entries = [older, guarded('dist/gate.js', 'dist/gate.js')];
    expect(widenPlan(entries, changed, () => last)).toMatchObject({ to: '1.0.2' });
    expect(changedGuards(entries, changed, () => last)).toBeUndefined();
  });

  it('finds the guard files that are not a file in a release', () => {
    const item = guarded('dist/gate.js', 'dist/run.js', 'dist/none.js');
    expect(missingGuards(last, item)).toEqual(['dist/none.js']);
    expect(missingGuards(folder.root, item)).toEqual(['dist/run.js', 'dist/none.js']);
    expect(missingGuards(last, entry('dist/gate.js'))).toEqual([]);
  });

  it('writes a sentence that names the guard files that differ or are missing, or no sentence', () => {
    expect(guardNote(undefined)).toBe('');
    expect(guardNote({ from: '1.0.0', files: ['a.js', 'b.js'] })).toBe(
      ' Guard files that are missing or have other bytes than in 1.0.0: a.js, b.js.',
    );
  });
});

describe('a latest release that does not widen a range', () => {
  const gate = entry('dist/gate.js', '1.0.0');

  it.each([
    ['is in a range already', [entry('dist/gate.js', '1.0.1')], identical],
    [
      'is below the newest range',
      [entry('dist/gate.js', '1.0.2')],
      { ...identical, version: '0.9.0' },
    ],
    ['is in an open range', [gate, entry('dist/run.js')], identical],
    ['is a pre-release', [gate], { ...identical, version: '1.0.1-beta.0' }],
  ])('reads no other release when the latest release %s', (_name, entries, latest) => {
    const fetchRelease = vi.fn(() => last);
    expect(widenPlan(entries, latest, fetchRelease)).toBeUndefined();
    expect(changedGuards(entries, latest, fetchRelease)).toBeUndefined();
    expect(fetchRelease).not.toHaveBeenCalled();
  });
});

describe('writing the widened ranges', () => {
  const widening = (entries: ReturnType<typeof entry>[], from = '1.0.0', name = 'fixture') => ({
    name,
    from,
    to: '1.0.1',
    entries,
    changedFiles: [],
  });
  const block = (name: string, versions: string, file: string) =>
    `    {\n      "package": "${name}",\n      "versions": ${versions},\n      "file": "${file}",\n      "reason": "r"\n    }`;
  const text = `{\n  "entries": [\n${[
    block('fixture', '{ "min": "1.0.0", "max": "1.0.0" }', 'x.js'),
    block('fixture', '{ "min": "1.0.0", "max": "1.0.0" }', 'y.js'),
    block('fixture', '{ "min": "0.1.0", "max": "0.9.0" }', 'x.js'),
    block('other', '{ "min": "1.0.0", "max": "1.0.0" }', 'x.js'),
    block('fixture', '{ "min": "1.0.0" }', 'x.js'),
  ].join(',\n')}\n  ]\n}\n`;

  it('sets the max of the widened entries only, and keeps the rest of the text', () => {
    const widened = widenedText(text, [widening([entry('x.js', '1.0.0')])]);
    const maxes = JSON.parse(widened).entries.map(
      (item: { versions: { max?: string } }) => item.versions.max,
    );
    expect(maxes).toEqual(['1.0.1', '1.0.0', '0.9.0', '1.0.0', undefined]);
    expect(widened.split('\n')).toHaveLength(text.split('\n').length);
    expect(widened.replace('"max": "1.0.1"', '"max": "1.0.0"')).toBe(text);
  });

  it('fails, and names the package, when an entry to widen is not in the text', () => {
    expect(() => widenedText(text, [widening([entry('z.js', '1.0.0')])])).toThrow(
      'Found 0 of 1 entries to widen in the text (fixture)',
    );
  });

  it('changes only the max lines of the shipped data file', () => {
    const file = readFileSync(path.join(import.meta.dirname, '../../data/unreached.json'), 'utf8');
    const entries: ReturnType<typeof entry>[] = JSON.parse(file).entries;
    const range = newestRange(entries.filter(item => item.package === 'next'));
    const next = { ...widening(range, range[0]?.versions.max, 'next'), to: '99.0.0' };
    const before = file.split('\n');
    const changedLines = widenedText(file, [next])
      .split('\n')
      .filter((line, index) => line !== before[index]);
    expect(range.length).toBeGreaterThan(0);
    expect(changedLines).toHaveLength(range.length);
    expect(changedLines.every(line => line.includes('"max": "99.0.0"'))).toBe(true);
  });
});

describe('the changeset and the pull request body', () => {
  const files = Array.from({ length: listLimit + 5 }, (_unused, index) => `dist/file-${index}.js`);
  const item = { name: 'a', from: '1.0.0', to: '1.0.1', entries: [], changedFiles: files };

  it('names each package once, with its new release', () => {
    const text = changesetText([item, { ...item }, { ...item, name: 'b', to: '2.0.0' }]);
    expect(text).toContain("'edgefit': patch");
    expect(text).toContain('`a` 1.0.1 and `b` 2.0.0.');
  });

  it('lists the files that differ up to the limit, and gives the command for all of them', () => {
    const body = pullRequestBody([item]);
    expect(body).toContain('### a: 1.0.0 to 1.0.1');
    expect(body.split('\n').filter(line => line.startsWith('- `dist/'))).toHaveLength(listLimit);
    expect(body).toContain('- and 5 more');
    expect(body).toContain('npm diff --diff=a@1.0.0 --diff=a@1.0.1 --diff-name-only');
  });

  it('says what the check does not read', () => {
    const body = pullRequestBody([item]);
    expect(body).toContain('does not read the releases between them');
    expect(body).toContain('does not read other files of the package');
    expect(body).toContain('when no entry lists that file in `guards`');
    expect(body).toContain('and every file that those entries list in `guards`');
    expect(body).toContain('does not change `source`');
  });

  it('keeps a file name from ending the code span of its line', () => {
    const body = pullRequestBody([{ ...item, changedFiles: ['dist/a`b\n@user.js'] }]);
    expect(body).toContain('- `dist/a?b?@user.js`');
  });
});
