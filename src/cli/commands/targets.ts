import type { CliIo } from '@/cli/io.ts';
import { findDataDirectory } from '@/data/data-directory.ts';
import { describeSource, readSources } from '@/data/manifest.ts';
import { createTarget, targetKeys } from '@/targets/index.ts';

export function runTargets(io: CliIo): number {
  const targets = targetKeys.map(key => {
    const { info } = createTarget(key, io.cwd, {
      workerd: { wranglerConfig: false },
      deno: { configFile: false },
      netlify: { configFile: false },
    });
    return [
      `${info.key}  ${info.platform}`,
      `  conditions ${info.conditions.join(', ')}`,
      `  data ${info.data}`,
    ].join('\n');
  });
  const sources = readSources(findDataDirectory()).map(
    source =>
      `  ${describeSource(source)}\n    ${source.license === 'none' ? 'no license, facts only' : source.license}, ${source.url}`,
  );
  io.stdout(`${targets.join('\n\n')}\n\nsources\n${sources.join('\n')}\n`);
  return 0;
}
