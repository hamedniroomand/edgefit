import type { Outcome } from './classify.mjs';

export interface ProbeEntry {
  api: string;
  kind?: string;
}

export function probeApi(entry: ProbeEntry): Promise<Outcome>;
export function probeApis(apis: ProbeEntry[]): Promise<Record<string, Outcome>>;
