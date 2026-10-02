export interface OverrideEntry {
  status: string;
  note: string;
  source: string;
  /** The stub checks its arguments before it throws, so an argument error is not a sign it works. */
  validatesFirst?: boolean;
}

export function readOverrides(runtime: string): Record<string, OverrideEntry>;
export function readMatrix(file: string): Record<string, unknown>;
