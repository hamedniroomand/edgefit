export interface OverrideEntry {
  status: string;
  note: string;
  source: string;
  /** The stub checks its arguments before it throws, so an argument error is not a sign it works. */
  validatesFirst?: boolean;
  /** The API is missing on the target and the code works without it. Only with status `supported`. */
  missingHarmless?: true;
  /** The API does not exist on the target. Only with status `unsupported`. */
  absent?: true;
}

export function readOverrides(runtime: string): Record<string, OverrideEntry>;
export function readMatrix(file: string): Record<string, unknown>;
