import { describe, expect, it } from 'vite-plus/test';

import { parseCheckArgs, parseCompareArgs, parseDiffArgs } from '@/cli/args.ts';

describe('parsing check arguments', () => {
  it('defaults to the text format with color', () => {
    expect(parseCheckArgs([])).toEqual({
      targets: undefined,
      entry: undefined,
      format: 'text',
      color: true,
      verbose: false,
    });
  });

  it('reads repeated targets and options', () => {
    const args = parseCheckArgs([
      '--target',
      'bun',
      '--target',
      'deno',
      '--entry',
      'src/main.ts',
      '--format',
      'json',
      '--no-color',
    ]);
    expect(args).toMatchObject({
      targets: ['bun', 'deno'],
      entry: ['src/main.ts'],
      format: 'json',
      color: false,
    });
  });

  it('reads --built and rejects it together with --entry', () => {
    expect(parseCheckArgs(['--built', 'dist']).built).toBe('dist');
    expect(() => parseCheckArgs(['--built', 'dist', '--entry', 'src/index.ts'])).toThrow(
      'either --entry or --built',
    );
  });

  it('rejects unknown targets and formats', () => {
    expect(() => parseCheckArgs(['--target', 'netlify'])).toThrow('Unknown target: netlify');
    expect(() => parseCheckArgs(['--format', 'xml'])).toThrow('Unknown format: xml');
  });

  it('rejects positionals and unknown options', () => {
    expect(() => parseCheckArgs(['extra'])).toThrow('Unexpected argument');
    expect(() => parseCheckArgs(['--nope'])).toThrow('Unknown option');
  });
});

describe('parsing compare arguments', () => {
  it('takes targets as positionals', () => {
    expect(parseCompareArgs(['bun', 'deno', '--all', '--verbose'])).toMatchObject({
      targets: ['bun', 'deno'],
      all: true,
      verbose: true,
    });
  });

  it('compares the default set without positionals', () => {
    expect(parseCompareArgs([])).toMatchObject({ targets: undefined, all: false, verbose: false });
  });

  it('rejects the github format and unknown targets', () => {
    expect(() => parseCompareArgs(['--format', 'github'])).toThrow('text and json formats');
    expect(() => parseCompareArgs(['netlify'])).toThrow('Unknown target: netlify');
  });
});

describe('parsing diff arguments', () => {
  it('takes the base and head reports', () => {
    expect(parseDiffArgs(['base.json', 'head.json'])).toEqual({
      base: 'base.json',
      head: 'head.json',
      format: 'text',
      color: true,
      failOn: 'new-errors',
    });
  });

  it('reads --fail-on', () => {
    expect(parseDiffArgs(['a.json', 'b.json', '--fail-on', 'never']).failOn).toBe('never');
  });

  it('rejects a wrong number of reports and unknown --fail-on values', () => {
    expect(() => parseDiffArgs(['a.json'])).toThrow('diff takes two JSON reports');
    expect(() => parseDiffArgs(['a.json', 'b.json', 'c.json'])).toThrow('diff takes two');
    expect(() => parseDiffArgs(['a.json', 'b.json', '--fail-on', 'sometimes'])).toThrow(
      'Unknown --fail-on value: sometimes',
    );
  });
});
