export interface RunError {
  ok: false;
  name?: string;
  code?: string;
  message?: string;
  stack?: string[];
  cause?: RunError;
}

export type RunStep = { ok: true } | RunError;

export interface Run {
  load: RunStep;
  reach?: RunStep;
}

export interface RowFinding {
  api: string;
  category: string;
  level: 'error' | 'warning';
  detail: string;
  /** The exports that reach the finding. Left out when every export does. */
  exports?: string[];
}

export type Outcome = 'verified' | 'confirmed' | 'mismatch' | 'absent';

export interface Cell {
  outcome: Outcome;
  kind: 'load' | 'reach';
  api?: string;
  error?: string;
  reason?: string;
}

export function errorChain(error: RunError): RunError[];
export function memberOf(api: string): string;
export function matches(error: RunError, finding: RowFinding): boolean;
export function matchOf(
  error: RunError,
  findings: readonly RowFinding[],
): { finding: RowFinding; error: RunError } | undefined;
export function errorText(error: RunError): string;
export function isArtifact(error: RunError): boolean;
export function isNetwork(error: RunError): boolean;
export function missingPackage(error: RunError): string | undefined;
export function judge(input: {
  status: string;
  run: Run;
  findings: readonly RowFinding[];
  /** The peers that the package marks optional in `peerDependenciesMeta`. */
  optionalPeers?: readonly string[];
}): Cell;
