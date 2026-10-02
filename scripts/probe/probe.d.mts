import type { Outcome } from './classify.mjs';

export interface ProbeEntry {
  api: string;
  kind?: string;
  /** Only check that the API exists, without calling it. Reports `present` or `missing`. */
  lookup?: boolean;
}

export function probeApi(entry: ProbeEntry, load?: (module: string) => unknown): Promise<Outcome>;
export function probeApis(
  apis: ProbeEntry[],
  load?: (module: string) => unknown,
): Promise<Record<string, Outcome>>;
