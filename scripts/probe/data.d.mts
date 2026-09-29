export interface OverrideEntry {
  status: string;
  note: string;
  source: string;
}

export function readOverrides(runtime: string): Record<string, OverrideEntry>;
