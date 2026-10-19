import { readFileSync } from 'node:fs';
import path from 'node:path';

const byExtension: Record<string, boolean> = {
  '.mjs': true,
  '.mts': true,
  '.cjs': false,
  '.cts': false,
};

/** Whether the nearest package.json makes the files of `directory` ES modules. */
function moduleScope(directory: string, cache: Map<string, boolean>): boolean {
  const cached = cache.get(directory);
  if (cached !== undefined) {
    return cached;
  }
  let result: boolean;
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(path.join(directory, 'package.json'), 'utf8'),
    );
    result = (manifest as { type?: unknown } | null)?.type === 'module';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const parent = path.dirname(directory);
    const absent = code === 'ENOENT' || code === 'ENOTDIR';
    // The scope of the file is not known. Node mode keeps all of an imported module, so no finding is lost.
    result = absent ? parent !== directory && moduleScope(parent, cache) : true;
  }
  cache.set(directory, result);
  return result;
}

/**
 * Whether esbuild can read the file in node mode. There, a default import of a CommonJS module
 * gives all of `module.exports`, whatever `__esModule` says. A file is in node mode when it is
 * `.mjs` or `.mts`, or when it is not `.cjs` or `.cts` and its nearest package.json has
 * `"type": "module"`. A package.json that cannot be read also gives node mode. `cache` holds the
 * answer for each directory.
 */
export function isNodeMode(file: string, cache: Map<string, boolean>): boolean {
  return byExtension[path.extname(file)] ?? moduleScope(path.dirname(file), cache);
}
