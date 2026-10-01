import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parsePackageArgs } from '@/cli/args.ts';
import type { CliIo } from '@/cli/io.ts';
import { renderBadge } from '@/package/badge.ts';
import { checkPackage } from '@/package/check-package.ts';
import { formatPackageJson } from '@/package/result.ts';
import { formatPackageText } from '@/package/text.ts';

export async function runPackage(argv: string[], io: CliIo): Promise<number> {
  const args = parsePackageArgs(argv);
  const spec =
    args.spec.kind === 'local'
      ? { ...args.spec, path: path.resolve(io.cwd, args.spec.path) }
      : args.spec;
  const result = await checkPackage(spec, {
    targets: args.targets,
    subpaths: args.exports,
    skip: args.skip,
    registry: args.registry,
    keep: args.keep,
    onKeep: directory => {
      io.stderr(`edgefit: kept ${directory}\n`);
    },
  });
  if (args.badge !== undefined) {
    await writeFile(path.resolve(io.cwd, args.badge), renderBadge(result));
  }
  io.stdout(
    args.format === 'json'
      ? formatPackageJson(result)
      : formatPackageText(result, { color: args.color && io.color }),
  );
  return Object.values(result.summary).some(status => status === 'fail' || status === 'error')
    ? 1
    : 0;
}
