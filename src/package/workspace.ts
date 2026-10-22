import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { EdgefitError } from '@/errors.ts';

import type { PackageManifest } from './entry.ts';
import { copyWithoutPrepare } from './source-copy.ts';
import { installSpec } from './spec.ts';
import type { PackageSpec } from './spec.ts';

const installTimeoutMs = 5 * 60 * 1000;

async function run(args: string[], cwd: string): Promise<string> {
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      'npm',
      args,
      { cwd, timeout: installTimeoutMs, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout);
        } else {
          reject(Object.assign(new Error(error.message), error, { stderr }));
        }
      },
    );
  });
  return stdout;
}

export interface Workspace {
  root: string;
  name: string;
  /** Read from the installed package, never from the requested range. */
  resolved: string;
  manifest: PackageManifest;
  /** Deletes the project unless `keep` was set. */
  dispose: () => Promise<void>;
}

export interface WorkspaceOptions {
  registry?: string;
  keep?: boolean;
  /** Where the temporary project goes. Defaults to the system temp directory. */
  tempDirectory?: string;
}

async function npm(args: string[], cwd: string): Promise<string> {
  try {
    return await run(args, cwd);
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string };
    if (failure.code === 'ENOENT') {
      throw new EdgefitError(
        'npm was not found.',
        '`edgefit package` installs the package with npm. Install Node.js with npm and retry.',
      );
    }
    const detail = failure.stderr?.trim().split('\n').slice(-3).join('\n');
    throw new EdgefitError(
      `npm ${args[0] ?? ''} failed.`,
      detail === undefined || detail === '' ? failure.message : detail,
    );
  }
}

/** A local directory is packed with `npm pack`, so the file list follows `files` and `.npmignore` as in a publish. */
async function tarballOf(directory: string, into: string): Promise<string> {
  const output = await npm(
    ['pack', path.resolve(directory), '--pack-destination', into, '--json', '--ignore-scripts'],
    into,
  );
  const [packed] = JSON.parse(output) as { filename: string }[];
  if (packed === undefined) {
    throw new EdgefitError('npm pack produced no tarball.');
  }
  return path.join(into, packed.filename);
}

/** Packs a directory from a copy of it that has no `prepare` script. */
async function packDirectory(source: string, root: string): Promise<string> {
  const packs = path.join(root, '.pack');
  await mkdir(packs);
  // npm leaves the bundled dependencies out of a package when the path has a symbolic link in it,
  // for example `/var` on macOS.
  const copy = path.join(await realpath(root), '.source');
  await copyWithoutPrepare(source, copy);
  return tarballOf(copy, packs);
}

/**
 * Installs the package into a throwaway project. `--ignore-scripts` is not optional: the package
 * is only read, never run. A directory is packed from a copy without its `prepare` script for the
 * same reason.
 */
export async function createWorkspace(
  spec: PackageSpec,
  options: WorkspaceOptions = {},
): Promise<Workspace> {
  const root = await mkdtemp(path.join(options.tempDirectory ?? tmpdir(), 'edgefit-package-'));
  const dispose = async (): Promise<void> => {
    if (options.keep !== true) {
      await rm(root, { recursive: true, force: true });
    }
  };
  try {
    await writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify({ name: 'edgefit-package-check', private: true, type: 'module' })}\n`,
    );
    let target = installSpec(spec);
    if (spec.kind === 'local') {
      const source = path.resolve(spec.path);
      if (source.endsWith('.tgz') || source.endsWith('.tar.gz')) {
        target = source;
      } else {
        target = await packDirectory(source, root);
      }
    }
    const flags = ['--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'];
    if (options.registry !== undefined) {
      flags.push(`--registry=${options.registry}`);
    }
    await npm(['install', target, ...flags], root);

    // npm records the installed package as the project's only dependency, whatever the spec was.
    const project = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const [name] = Object.keys(project.dependencies ?? {});
    if (name === undefined) {
      throw new EdgefitError('npm installed nothing.');
    }
    const manifest = JSON.parse(
      await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8'),
    ) as PackageManifest;
    return { root, name, resolved: manifest.version ?? 'unknown', manifest, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
