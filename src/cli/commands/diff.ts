import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseDiffArgs } from '@/cli/args.ts';
import type { CliIo } from '@/cli/io.ts';
import { EdgefitError } from '@/errors.ts';
import { diffFails, diffReports } from '@/report/diff.ts';
import { formatDiff } from '@/report/index.ts';
import { parseJsonReport } from '@/report/json.ts';
import type { JsonReport } from '@/report/json.ts';

async function readReport(file: string, io: CliIo): Promise<JsonReport> {
  let text: string;
  try {
    text = await readFile(path.resolve(io.cwd, file), 'utf8');
  } catch {
    throw new EdgefitError(`Cannot read ${file}.`);
  }
  return parseJsonReport(text, file);
}

export async function runDiff(argv: string[], io: CliIo): Promise<number> {
  const args = parseDiffArgs(argv);
  const [base, head] = await Promise.all([readReport(args.base, io), readReport(args.head, io)]);
  const diff = diffReports(base, head);
  io.stdout(formatDiff(diff, args.format, { color: args.color && io.color }));
  return diffFails(diff, args.failOn) ? 1 : 0;
}
