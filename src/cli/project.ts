import path from 'node:path';

import type { CliIo } from '@/cli/io.ts';
import { loadConfig } from '@/config/load-config.ts';
import type { EdgefitConfig, TargetKey } from '@/types.ts';

export interface ProjectArgs {
  root: string | undefined;
  config: string | undefined;
  targets: TargetKey[] | undefined;
  entry: string[] | undefined;
}

/** The project root and its config file, with command-line flags taking precedence. */
export async function loadProject(
  args: ProjectArgs,
  io: CliIo,
): Promise<{ root: string; config: EdgefitConfig }> {
  const root = path.resolve(io.cwd, args.root ?? '.');
  const loaded = await loadConfig(root, args.config);
  const config: EdgefitConfig = {
    ...loaded.config,
    ...(args.targets === undefined ? {} : { targets: args.targets }),
    ...(args.entry === undefined ? {} : { entry: args.entry }),
  };
  return { root, config };
}
