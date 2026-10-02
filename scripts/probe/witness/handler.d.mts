import type { Outcome } from '../classify.mjs';
import type { Check, CheckResult } from './checks.mjs';
import type { WitnessSpec } from './spec.mjs';

export type WitnessOptions = {
  entry: string;
  spec: WitnessSpec;
  checks: Record<string, Check>;
  load?: (module: string) => unknown;
  /** The `typeof` of each global, from code that names it. */
  types?: () => Record<string, string>;
};
export type WitnessResults = {
  entry: string;
  specHash: string;
  deno: string | null;
  runtime: Record<string, unknown>;
  names: string[];
  types: Record<string, string>;
  typesError?: string;
  outcomes: Record<string, Outcome>;
  checks: Record<string, CheckResult>;
};

export function observe(options: WitnessOptions): Promise<WitnessResults>;
export function respond(options: WitnessOptions): Promise<Response>;
