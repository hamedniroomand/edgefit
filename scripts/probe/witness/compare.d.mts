import type { OverrideEntry } from '../data.mjs';
import type { DriftSection } from '../vercel/docs.mjs';
import type { WitnessResults } from './handler.mjs';

type Observed = Pick<WitnessResults, 'deno' | 'names' | 'types' | 'outcomes' | 'checks'>;

export function compareNetlify(
  results: Pick<Observed, 'deno' | 'outcomes' | 'checks'>,
  data: {
    deno: string;
    overrides: Record<string, OverrideEntry>;
    matrix: Record<string, unknown>;
    webMissing?: ReadonlySet<string>;
  },
): { sections: DriftSection[]; lines: string[] };
export function compareVercel(
  results: Pick<Observed, 'names' | 'types' | 'outcomes' | 'checks'>,
  data: { blocked: ReadonlySet<string>; accepted: ReadonlySet<string>; useNames: boolean },
): DriftSection[];
