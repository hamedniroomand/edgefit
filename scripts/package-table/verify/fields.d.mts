import type { Cell } from './judge.mjs';

export interface VerifyRun {
  package: string;
  resolved: string;
  runtime: string;
  version: string;
  cell: Cell;
}

export interface PublishedCell {
  outcome: 'verified' | 'confirmed';
  kind: 'load' | 'reach';
  runtime: string;
  error?: string;
  api?: string;
}

export function readVerify(directory?: string): Map<string, VerifyRun[]>;
export function verifiedOf(
  runs: readonly VerifyRun[],
  resolved: string,
): Record<string, PublishedCell> | undefined;
export function verifiedRow(verified: Record<string, PublishedCell>): Record<string, string>;
