import type { Dump, OptionMatch, Status } from '@/data/dump.ts';
import type { Category, TargetKey } from '@/types.ts';

export interface CompatSource {
  provider: string;
  version: string;
  url?: string;
}

/** One curated result for an API on one target. */
export interface CompatEntry {
  target: TargetKey;
  /** `fs`, `fs/promises`, or `*globals*`. */
  module: string;
  path: string[];
  status: Exclude<Status, 'uncovered'>;
  note?: string;
  /** Reported under this category instead of the one the status maps to, e.g. `web`. */
  category?: Category;
  /** The API does not exist on the target, so a use that checks for it first is not a finding. */
  absent?: true;
  /** A finding only for a read that runs as the module loads, see `LookupResult.loadOnly`. */
  loadOnly?: true | 'bare';
  /** The options that make a call fail. A call that passes none of them is not a finding. */
  options?: readonly OptionMatch[];
  /** Applies to this API alone. What is below it is not described, so a member stays uncovered. */
  exact?: true;
  source: CompatSource;
}

/**
 * What a runtime exposes next to what Node exposes. Kept as trees because subtree
 * queries such as `hasProblemsBelow` need them.
 */
export interface CompatTree {
  baseline: Dump;
  runtime: Dump;
  source: CompatSource;
}

/** Turns one source format into the internal model. The only code aware of that format. */
export interface CompatProvider<T extends CompatEntry[] | CompatTree> {
  name: string;
  load: (dataDirectory: string) => T;
}
