import type { Disagreement } from './compare.mjs';

export function summarizeDisagreements(
  disagreements: Disagreement[],
  outcomes: Record<string, string>,
): string[];
