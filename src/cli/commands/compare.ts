import { parseCompareArgs } from '@/cli/args.ts';
import type { CliIo } from '@/cli/io.ts';
import { loadProject } from '@/cli/project.ts';
import { check, countLevels } from '@/core/check.ts';
import { formatCompareJson } from '@/report/compare-json.ts';
import { formatCompareText } from '@/report/compare-text.ts';
import { compareTargetKeys } from '@/targets/index.ts';

export async function runCompare(argv: string[], io: CliIo): Promise<number> {
  const args = parseCompareArgs(argv);
  const { root, config } = await loadProject(
    { ...args, targets: args.targets ?? [...compareTargetKeys] },
    io,
  );
  const result = await check({ root, config, includeSupported: true });
  io.stdout(
    args.format === 'json'
      ? formatCompareJson(result, args)
      : formatCompareText(result, { ...args, color: args.color && io.color }),
  );
  return countLevels(result).errors > 0 ? 1 : 0;
}
