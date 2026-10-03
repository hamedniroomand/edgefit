import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';

import { EdgefitError } from '@/errors.ts';
import { parsePackageSpec } from '@/package/spec.ts';
import type { PackageSpec } from '@/package/spec.ts';
import { failOnValues } from '@/report/diff.ts';
import type { FailOn } from '@/report/diff.ts';
import { isReportFormat } from '@/report/index.ts';
import type { ReportFormat } from '@/report/index.ts';
import { isTargetKey } from '@/targets/index.ts';
import type { TargetKey } from '@/types.ts';

export interface CheckArgs {
  targets: TargetKey[] | undefined;
  entry: string[] | undefined;
  built: string | undefined;
  root: string | undefined;
  config: string | undefined;
  format: ReportFormat;
  color: boolean;
  verbose: boolean;
}

export interface CompareArgs {
  /** From positionals. `undefined` compares the default set. */
  targets: TargetKey[] | undefined;
  entry: string[] | undefined;
  root: string | undefined;
  config: string | undefined;
  format: CompareFormat;
  color: boolean;
  all: boolean;
  verbose: boolean;
}

export interface DiffArgs {
  base: string;
  head: string;
  format: ReportFormat;
  color: boolean;
  failOn: FailOn;
}

export interface PackageArgs {
  spec: PackageSpec;
  /** `undefined` checks the compared targets. */
  targets: TargetKey[] | undefined;
  format: CompareFormat;
  color: boolean;
  exports: string[];
  skip: string[];
  /** The subpath that decides the result, for a package without a `.` entry. */
  main: string | undefined;
  keep: boolean;
  registry: string | undefined;
  /** Where to write the badge SVG. */
  badge: string | undefined;
}

export type CompareFormat = Extract<ReportFormat, 'text' | 'json'>;

const usageHint = 'Run `edgefit help` for usage.';

const projectOptions = {
  entry: { type: 'string', multiple: true },
  root: { type: 'string' },
  config: { type: 'string' },
  format: { type: 'string' },
  color: { type: 'boolean' },
} as const;

function parseTargets(values: string[] | undefined): TargetKey[] | undefined {
  if (values === undefined) {
    return undefined;
  }
  const unknown = values.filter(value => !isTargetKey(value));
  if (unknown.length > 0) {
    throw new EdgefitError(
      `Unknown target: ${unknown.join(', ')}`,
      'Run `edgefit targets` to list them.',
    );
  }
  return values.filter(value => isTargetKey(value));
}

function parseFormat(value: string | undefined): ReportFormat {
  if (value === undefined) {
    return 'text';
  }
  if (!isReportFormat(value)) {
    throw new EdgefitError(`Unknown format: ${value}`, usageHint);
  }
  return value;
}

function parseFailOn(value: string | undefined): FailOn {
  const failOn = failOnValues.find(known => known === (value ?? 'new-errors'));
  if (failOn === undefined) {
    throw new EdgefitError(
      `Unknown --fail-on value: ${String(value)}`,
      `Use one of ${failOnValues.join(', ')}.`,
    );
  }
  return failOn;
}

function parse<T extends ParseArgsConfig>(config: T): ReturnType<typeof parseArgs<T>> {
  try {
    return parseArgs(config);
  } catch (error) {
    throw new EdgefitError((error as Error).message, usageHint);
  }
}

export function parseCheckArgs(argv: string[]): CheckArgs {
  const { values } = parse({
    args: argv,
    allowPositionals: false,
    allowNegative: true,
    options: {
      ...projectOptions,
      target: { type: 'string', multiple: true },
      built: { type: 'string' },
      verbose: { type: 'boolean' },
    },
  });
  if (values.built !== undefined && values.entry !== undefined) {
    throw new EdgefitError('Pass either --entry or --built, not both.', usageHint);
  }
  return {
    targets: parseTargets(values.target),
    entry: values.entry,
    built: values.built,
    root: values.root,
    config: values.config,
    format: parseFormat(values.format),
    color: values.color ?? true,
    verbose: values.verbose ?? false,
  };
}

export function parseCompareArgs(argv: string[]): CompareArgs {
  const { values, positionals } = parse({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      ...projectOptions,
      all: { type: 'boolean' },
      verbose: { type: 'boolean' },
    },
  });
  const format = parseFormat(values.format);
  if (format === 'github') {
    throw new EdgefitError('compare supports the text and json formats.', usageHint);
  }
  return {
    targets: parseTargets(positionals.length > 0 ? positionals : undefined),
    entry: values.entry,
    root: values.root,
    config: values.config,
    format,
    color: values.color ?? true,
    all: values.all ?? false,
    verbose: values.verbose ?? false,
  };
}

export function parseDiffArgs(argv: string[]): DiffArgs {
  const { values, positionals } = parse({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      format: projectOptions.format,
      color: projectOptions.color,
      'fail-on': { type: 'string' },
    },
  });
  const [base, head, ...extra] = positionals;
  if (base === undefined || head === undefined || extra.length > 0) {
    throw new EdgefitError('diff takes two JSON reports: <base.json> <head.json>.', usageHint);
  }
  return {
    base,
    head,
    format: parseFormat(values.format),
    color: values.color ?? true,
    failOn: parseFailOn(values['fail-on']),
  };
}

export function parsePackageArgs(argv: string[]): PackageArgs {
  const { values, positionals } = parse({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      target: { type: 'string', multiple: true },
      format: projectOptions.format,
      color: projectOptions.color,
      export: { type: 'string', multiple: true },
      skip: { type: 'string', multiple: true },
      main: { type: 'string' },
      keep: { type: 'boolean' },
      registry: { type: 'string' },
      badge: { type: 'string' },
    },
  });
  const [spec, ...extra] = positionals;
  if (spec === undefined || extra.length > 0) {
    throw new EdgefitError(
      'package takes one package: <name[@version]>, a directory or a .tgz file.',
      usageHint,
    );
  }
  const format = parseFormat(values.format);
  if (format === 'github') {
    throw new EdgefitError('package supports the text and json formats.', usageHint);
  }
  return {
    spec: parsePackageSpec(spec),
    targets: parseTargets(values.target),
    format,
    color: values.color ?? true,
    exports: values.export ?? [],
    skip: values.skip ?? [],
    main: values.main,
    keep: values.keep ?? false,
    registry: values.registry,
    badge: values.badge,
  };
}
