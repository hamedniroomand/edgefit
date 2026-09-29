import process from 'node:process';

export interface CliIo {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Whether stdout supports ANSI colors. */
  color: boolean;
}

export function processIo(): CliIo {
  const noColor = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '';
  return {
    cwd: process.cwd(),
    stdout: text => {
      process.stdout.write(text);
    },
    stderr: text => {
      process.stderr.write(text);
    },
    color: process.stdout.isTTY && !noColor,
  };
}
