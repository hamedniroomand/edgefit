import { parseCheckArgs } from '@/cli/args.ts';
import type { CliIo } from '@/cli/io.ts';
import { loadProject } from '@/cli/project.ts';
import { check, countLevels } from '@/core/check.ts';
import { formatReport } from '@/report/index.ts';

export async function runCheck(argv: string[], io: CliIo): Promise<number> {
  const args = parseCheckArgs(argv);
  const { root, config } = await loadProject(args, io);
  const result = await check({ root, config, built: args.built });
  io.stdout(formatReport(result, args.format, { color: args.color && io.color }));
  return countLevels(result).errors > 0 ? 1 : 0;
}
