import type { Run } from './judge.mjs';

export const marker: string;
export function entrySource(options: {
  specifier: string;
  reach: boolean;
  host: 'worker' | 'script';
}): string;
export function resultOf(stdout: string): Run | undefined;
