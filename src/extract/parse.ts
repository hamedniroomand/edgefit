import { parseSync } from 'oxc-parser';
import type { ParseResult, ParserOptions } from 'oxc-parser';

import { restoreChains } from './lowered-chains.ts';

function languageFor(file: string): ParserOptions['lang'] {
  if (/\.[cm]?tsx$/u.test(file)) {
    return 'tsx';
  }
  if (/\.[cm]?ts$/u.test(file)) {
    return 'ts';
  }
  return file.endsWith('.jsx') ? 'jsx' : 'js';
}

export function isTypeScript(file: string): boolean {
  return /\.[cm]?tsx?$/u.test(file);
}

function sourceTypeFor(file: string): ParserOptions['sourceType'] {
  if (/\.c[jt]s$/u.test(file)) {
    return 'commonjs';
  }
  return /\.m[jt]s$/u.test(file) ? 'module' : 'unambiguous';
}

function parseSource(file: string, source: string): ParseResult {
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

/** Parses a file. A `?.` or `??` that a compiler wrote for an older target is restored to its source form. */
export function parse(file: string, source: string): ParseResult {
  const result = parseSource(file, source);
  restoreChains(result.program);
  return result;
}
