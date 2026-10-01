import { extractModule } from '@/extract/index.ts';
import type { ExtractedModule } from '@/extract/index.ts';
import type { GraphModule, ImportLink, ModuleGraph } from '@/resolve/graph.ts';
import { reachedUsages } from '@/trace/reach.ts';

export interface Source {
  code: string;
  /** Specifier to file. Anything other than a static import is given as `kind:specifier`. */
  imports?: Record<string, string>;
}

const globals = new Set(['process', 'Buffer']);

function linksOf(imports: Record<string, string>): ImportLink[] {
  return Object.entries(imports).map(([specifier, path]) => {
    const [kind, original] = specifier.includes(':')
      ? (specifier.split(':') as [string, string])
      : ['import-statement', specifier];
    return { path, original: original === '?' ? undefined : original, kind };
  });
}

/** The API usages each file keeps once only the code the entry reaches is left. */
export function reached(
  files: Record<string, Source>,
  entry = 'index.js',
): Record<string, string[]> {
  const modules = new Map<string, ExtractedModule>();
  const graph: ModuleGraph = { entry, modules: new Map<string, GraphModule>() };
  for (const [file, { code, imports = {} }] of Object.entries(files)) {
    const links = linksOf(imports);
    graph.modules.set(file, { imports: links.map(link => link.path), links, externals: [] });
    modules.set(file, extractModule(file, code, { globals, shape: true }));
  }
  return Object.fromEntries(
    [...reachedUsages(graph, modules)].map(([file, usages]) => [
      file,
      usages.map(usage => usage.display).filter(display => display.includes('.')),
    ]),
  );
}

export const fs = "import fs from 'node:fs';\n";
export const lib = (code: string): Source => ({ code: `${fs}${code}` });
export const entry = (code: string, imports: Record<string, string>): Source => ({ code, imports });
export const twoHelpers = lib(
  'export function upper(text) {\n  return text.toUpperCase();\n}\nexport function watchDir(dir) {\n  return fs.watch(dir);\n}',
);
