import type { RowFinding } from './judge.mjs';

export interface ScriptImport {
  specifier: string;
  names: string[];
}

export interface Plan {
  package: string;
  /** The package, or its main subpath when the row names one. */
  specifier: string;
  resolved: string;
  status: 'pass' | 'fail';
  findings: RowFinding[];
  /** The notes of the main entry on the runtime. A note names one optional peer, or no peer. */
  notes: string[];
  kind: 'load' | 'reach';
  script?: string;
  /** Why the reach script was rejected. The run is then a load only. */
  problem?: string;
}

export function importsOf(source: string, file?: string): ScriptImport[];
export function namesFrom(imports: readonly ScriptImport[], name: string): string[];
export function rowFindings(result: unknown, target: string): RowFinding[];
export function rowNotes(result: unknown, target: string): string[];
export function scriptProblem(
  imports: readonly ScriptImport[],
  name: string,
  findings: readonly RowFinding[],
): string | undefined;
export function scriptOf(directory: string, file: string): string | undefined;
export function planOf(result: unknown, runtime: string, script?: string): Plan | undefined;
