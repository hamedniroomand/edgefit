import type { OverrideEntry } from './data.mjs';

export interface Drift {
  runtime: string;
  pinned: string;
  latest: string;
  /** Marked missing in the data, but found in the latest release. */
  nowPresent: string[];
  /** Curated stubs that the latest release implements. */
  stubsNowWork: string[];
  /** Mocked entries the latest release implements. */
  mocksImplemented: string[];
  /** Findings that are not API lists, such as a documentation page that changed. */
  sections?: { title: string; items: string[] }[];
}

export const issueMarker: string;
export const issueTitle: string;

export function missingApis(
  runtime: Record<string, unknown>,
  baseline: Record<string, unknown>,
  overrides: Record<string, OverrideEntry>,
): string[];
export function compatibilityDateFor(version: string): string | undefined;
export function driftFor(input: {
  runtime: string;
  pinned: string;
  latest: string;
  outcomes: Record<string, string>;
  mocked: Record<string, string>;
  overrides: Record<string, OverrideEntry>;
}): Drift;
export function hasDrift(drift: Drift): boolean;
export function renderIssue(drifts: Drift[]): { body: string; drift: boolean };
