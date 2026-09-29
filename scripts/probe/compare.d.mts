import type { OverrideEntry } from './data.mjs';

export function matrixHas(tree: Record<string, unknown>, api: string): boolean;
export function compareOutcomes(
  outcomes: Record<string, string>,
  overrides: Record<string, OverrideEntry>,
  matrix: Record<string, unknown>,
): { api: string; message: string }[];
export function implementedMocks(mocked: Record<string, string>): string[];
