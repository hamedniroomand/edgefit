import type { OverrideEntry } from './data.mjs';

export function compareOutcomes(
  outcomes: Record<string, string>,
  overrides: Record<string, OverrideEntry>,
  matrix: Record<string, unknown>,
): { api: string; message: string }[];
