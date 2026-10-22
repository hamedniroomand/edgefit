import { cp, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EdgefitError } from '@/errors.ts';

type SourceManifest = {
  scripts?: unknown;
  bundleDependencies?: unknown;
  bundledDependencies?: unknown;
};

const byteOrderMark = 0xfeff;

/** The real path of the directory, because `cp` copies a link as a link and the copy must not point back to the source. */
async function readSource(
  directory: string,
): Promise<{ source: string; manifest: SourceManifest }> {
  let source: string;
  let text: string;
  try {
    source = await realpath(directory);
    text = await readFile(path.join(source, 'package.json'), 'utf8');
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new EdgefitError(
        `No package.json found in ${directory}.`,
        'Pass the path of a directory that holds a package.json.',
      );
    }
    throw error;
  }
  let manifest: unknown;
  try {
    // npm accepts a byte order mark at the start of package.json, but JSON.parse does not.
    manifest = JSON.parse(text.codePointAt(0) === byteOrderMark ? text.slice(1) : text);
  } catch {
    manifest = undefined;
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new EdgefitError(`The package.json in ${directory} is not a valid JSON object.`);
  }
  return { source, manifest: manifest as SourceManifest };
}

/**
 * Copies a package directory without its `prepare` script. `npm pack` runs `prepare` on npm 10
 * even with `--ignore-scripts`, and the package must be only read, never run.
 *
 * The copy skips `.git` and `node_modules` at the top level of the package, and keeps
 * `node_modules` when the package bundles dependencies. It copies a symbolic link as a link, and
 * it writes the new package.json as a new file, so it never changes the source.
 */
export async function copyWithoutPrepare(directory: string, destination: string): Promise<void> {
  const { source, manifest } = await readSource(directory);
  const skipped = new Set([path.join(source, '.git'), path.join(source, 'package.json')]);
  const bundles = manifest.bundleDependencies ?? manifest.bundledDependencies;
  if (bundles === undefined || bundles === false) {
    skipped.add(path.join(source, 'node_modules'));
  }
  await cp(source, destination, { recursive: true, filter: from => !skipped.has(from) });
  if (typeof manifest.scripts === 'object' && manifest.scripts !== null) {
    delete (manifest.scripts as Record<string, unknown>).prepare;
  }
  await writeFile(path.join(destination, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
