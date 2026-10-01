import type { OverrideEntry } from './data.mjs';

export interface Disagreement {
  api: string;
  message: string;
  /** Whether the curated data says the API exists, so a missing probe is a possible false pass. */
  dataSaysPresent: boolean;
}

export function matrixHas(tree: Record<string, unknown>, api: string): boolean;
export function compareOutcomes(
  outcomes: Record<string, string>,
  overrides: Record<string, OverrideEntry>,
  matrix: Record<string, unknown>,
): Disagreement[];
export function implementedMocks(mocked: Record<string, string>): string[];
