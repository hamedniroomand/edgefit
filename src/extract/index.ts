import { parseSync } from 'oxc-parser';
import type { Node, ParseResult, ParserOptions } from 'oxc-parser';

import type { Usage } from '@/types.ts';

import { UsageCollector } from './usage-collector.ts';
import { Walker } from './walker.ts';

export interface ExtractOptions {
  /** Global names worth tracking, such as `process` and `Buffer`. */
  globals: ReadonlySet<string>;
}

function languageFor(file: string): ParserOptions['lang'] {
  if (/\.[cm]?tsx$/u.test(file)) {
    return 'tsx';
  }
  if (/\.[cm]?ts$/u.test(file)) {
    return 'ts';
  }
  return file.endsWith('.jsx') ? 'jsx' : 'js';
}

function sourceTypeFor(file: string): ParserOptions['sourceType'] {
  if (/\.c[jt]s$/u.test(file)) {
    return 'commonjs';
  }
  return /\.m[jt]s$/u.test(file) ? 'module' : 'unambiguous';
}

function parse(file: string, source: string): ParseResult {
  const options: ParserOptions = {
    lang: languageFor(file),
    sourceType: sourceTypeFor(file),
    preserveParens: true,
  };
  const result = parseSync(file, source, options);
  if (result.errors.length === 0 || options.lang !== 'js') {
    return result;
  }
  // Some packages ship JSX in `.js` files.
  const retry = parseSync(file, source, { ...options, lang: 'jsx' });
  return retry.errors.length === 0 ? retry : result;
}

/** Parses a file and returns every runtime API use in it. */
export function extractUsages(file: string, source: string, options: ExtractOptions): Usage[] {
  const collector = new UsageCollector(file, source);
  const result = parse(file, source);
  const [error] = result.errors;
  if (error !== undefined && result.program.body.length === 0) {
    collector.dynamic(
      undefined,
      '<unparsed file>',
      `the file could not be parsed: ${error.message}`,
      error.labels[0]?.start ?? 0,
    );
    return collector.usages;
  }
  new Walker(collector, options.globals).visit(result.program as Node);
  return collector.usages;
}
