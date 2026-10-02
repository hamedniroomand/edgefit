import type { DriftSection } from './docs.mjs';

export const knownDivergences: Record<string, string>;
export function isPlumbing(name: string): boolean;
export function compareEmulator(
  observed: { names: string[]; evalThrows: boolean; functionThrows: boolean },
  documented: string[],
  accepted: Set<string>,
): DriftSection[];
