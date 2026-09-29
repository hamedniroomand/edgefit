import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const actionDirectory = path.join(import.meta.dirname, '../../action');

export interface ScriptRun {
  status: number | null;
  /** Standard output and error together, as the workflow log shows them. */
  log: string;
  /** What the script wrote to $GITHUB_OUTPUT, as key and value. */
  outputs: Record<string, string>;
}

export function temporaryDirectory(): string {
  return mkdtempSync(path.join(tmpdir(), 'edgefit-action-'));
}

export function write(file: string, content: string, executable = false): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  if (executable) {
    chmodSync(file, 0o755);
  }
}

function outputsOf(file: string): Record<string, string> {
  if (!existsSync(file)) {
    return {};
  }
  const text = readFileSync(file, 'utf8');
  const entries = text
    .split('\n')
    .filter(line => line.includes('='))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)] as const);
  return Object.fromEntries(entries);
}

/** Runs one of the action's scripts the way a workflow step does, in `cwd`. */
export function runScript(
  name: 'base.sh' | 'install.sh',
  cwd: string,
  environment: Record<string, string>,
): ScriptRun {
  const output = path.join(temporaryDirectory(), 'github-output');
  const result = spawnSync('bash', [path.join(actionDirectory, name)], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: output, ...environment },
  });
  return {
    status: result.status,
    log: `${result.stdout}${result.stderr}`,
    outputs: outputsOf(output),
  };
}
