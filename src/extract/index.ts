import { parseSync } from 'oxc-parser';
import type { Node, ParseResult, ParserOptions } from 'oxc-parser';

import { collectShape } from '@/trace/shape.ts';
import type { ModuleShape } from '@/trace/shape.ts';
import type { ApiRef, Usage } from '@/types.ts';

import { findAssigned, findAssignedOptions } from './assigned.ts';
import { findFunctions } from './call-keys.ts';
import { findImportWrappers } from './import-wrappers.ts';
import { findSuppliedLoads } from './supplied-loads.ts';
import { typeOnlyImports } from './type-only-imports.ts';
import { UsageCollector } from './usage-collector.ts';
import { Walker } from './walker.ts';

export interface ExtractOptions {
  /** Global names worth tracking, such as `process` and `Buffer`. */
  globals: ReadonlySet<string>;
  imported?: boolean;
  /** What `process.env.NODE_ENV` is replaced with, or `undefined` when it is not fixed. */
  nodeEnv: string | undefined;
  /** Also split the module into the pieces that run on load and the pieces that wait to be used. */
  shape?: boolean;
  /** The target's platform stubs out a Node.js module it lacks, so only reading from one fails. */
  lazyNodeImports?: boolean;
  /** The bundler keeps imports that nothing uses as a value: `verbatimModuleSyntax` is on. */
  keepUnusedImports?: boolean;
  /** Specifiers of the file that resolve to a native addon, as written in the source, with the name to show. */
  nativeSpecifiers?: ReadonlyMap<string, string>;
  /** Imported local names that another module of the graph exports as a Node.js module. */
  importedModules?: ReadonlyMap<string, ApiRef>;
  /** Imported local names that another module of the graph exports as a plain string. */
  importedStrings?: ReadonlyMap<string, string>;
}

export interface ExtractedModule {
  usages: Usage[];
  /** Where each usage was found in the source. */
  offsets: number[];
  /** Set when `shape` was asked for and the file could be parsed. */
  shape: ModuleShape | undefined;
  /** The exports that are a Node.js module, by exported name, with where the export is written. */
  /** The names of the options this file sets to a value that is not `false`, `0`, `null`, `undefined` or `''`. */
  optionsSet: readonly string[];
  aliases: ReadonlyMap<string, { ref: ApiRef; offset: number }>;
  /** The exports that are a plain string, by exported name. */
  strings: ReadonlyMap<string, string>;
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

export function isTypeScript(file: string): boolean {
  return /\.[cm]?tsx?$/u.test(file);
}

function sourceTypeFor(file: string): ParserOptions['sourceType'] {
  if (/\.c[jt]s$/u.test(file)) {
    return 'commonjs';
  }
  return /\.m[jt]s$/u.test(file) ? 'module' : 'unambiguous';
}

export function parse(file: string, source: string): ParseResult {
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

function finish(
  collector: UsageCollector,
  shape?: ModuleShape,
  optionsSet: readonly string[] = [],
): ExtractedModule {
  const { usages, offsets, aliases, strings } = collector;
  return { usages, offsets, aliases, strings, optionsSet, shape };
}

/** Parses a file and returns every runtime API use in it, and where each one is. */
export function extractModule(
  file: string,
  source: string,
  options: ExtractOptions,
): ExtractedModule {
  const collector = new UsageCollector(
    file,
    source,
    options.lazyNodeImports === true,
    options.nativeSpecifiers,
    options.importedModules,
    options.importedStrings,
  );
  const result = parse(file, source);
  const [error] = result.errors;
  if (error !== undefined && result.program.body.length === 0) {
    collector.dynamic(
      undefined,
      '<unparsed file>',
      `the file could not be parsed: ${error.message}`,
      error.labels[0]?.start ?? 0,
    );
    return finish(collector);
  }
  const body = result.program.body as Node[];
  // Only a TypeScript compiler drops an import because its names are not used as values.
  const dropped =
    options.keepUnusedImports === true || !isTypeScript(file)
      ? new Set<string>()
      : typeOnlyImports(body);
  const { functions, callKeys } = findFunctions(body);
  const walker = new Walker(
    collector,
    options.globals,
    options.nodeEnv,
    dropped,
    findAssigned(body),
    findImportWrappers(body),
    functions,
    findSuppliedLoads(body, functions),
    callKeys,
    options.imported,
  );
  walker.visit(result.program as Node);
  collector.omitMainFunctions(body, functions, walker.mainOnlyNodes);
  const shape =
    options.shape === true ? collectShape(body, result.module.hasModuleSyntax, dropped) : undefined;
  return finish(collector, shape, findAssignedOptions(body));
}

/** Parses a file and returns every runtime API use in it. */
export function extractUsages(file: string, source: string, options: ExtractOptions): Usage[] {
  return extractModule(file, source, options).usages;
}
