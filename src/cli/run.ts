import { EdgefitError } from '@/errors.ts';

import { runCheck } from './commands/check.ts';
import { runCompare } from './commands/compare.ts';
import { runDiff } from './commands/diff.ts';
import { runTargets } from './commands/targets.ts';
import { helpText } from './help.ts';
import type { CliIo } from './io.ts';

export const exitCodes = { ok: 0, findings: 1, input: 2 } as const;

function dispatch(argv: string[], io: CliIo): Promise<number> | number {
  const [command, ...rest] = argv;
  switch (command) {
    case 'check': {
      return runCheck(rest, io);
    }
    case 'compare': {
      return runCompare(rest, io);
    }
    case 'diff': {
      return runDiff(rest, io);
    }
    case 'targets': {
      return runTargets(io);
    }
    case undefined:
    case 'help':
    case '--help':
    case '-h': {
      io.stdout(helpText);
      return exitCodes.ok;
    }
    default: {
      throw new EdgefitError(`Unknown command: ${command}`, 'Run `edgefit help` for usage.');
    }
  }
}

/** Runs the CLI and returns its exit code. Input problems are reported without a stack trace. */
export async function run(argv: string[], io: CliIo): Promise<number> {
  try {
    return await dispatch(argv, io);
  } catch (error) {
    if (!(error instanceof EdgefitError)) {
      throw error;
    }
    const hint = error.hint === undefined ? '' : `\n${error.hint}`;
    io.stderr(`edgefit: ${error.message}${hint}\n`);
    return exitCodes.input;
  }
}
