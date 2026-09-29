import { displayApi } from '@/data/builtins.ts';
import type { ApiRef, Location, Usage } from '@/types.ts';

import { GuardStack } from './guards.ts';
import { normalizeRef } from './refs.ts';

export class UsageCollector {
  public readonly usages: Usage[] = [];
  /** The APIs known to exist at the point being visited. */
  public readonly guards = new GuardStack();
  readonly #file: string;
  readonly #lineStarts: number[] = [0];

  public constructor(file: string, source: string) {
    this.#file = file;
    for (let index = source.indexOf('\n'); index !== -1; index = source.indexOf('\n', index + 1)) {
      this.#lineStarts.push(index + 1);
    }
  }

  public location(offset: number): Location {
    let low = 0;
    let high = this.#lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((this.#lineStarts[middle] ?? 0) <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return { file: this.#file, line: low + 1, column: offset - (this.#lineStarts[low] ?? 0) + 1 };
  }

  public api(ref: ApiRef, offset: number): void {
    const api = normalizeRef(ref);
    const guarded = this.guards.covers(api);
    this.usages.push({
      kind: 'api',
      api,
      display: displayApi(api.module, api.path),
      location: this.location(offset),
      ...(guarded ? { guarded: true as const } : {}),
    });
  }

  /** Records an access edgefit cannot follow statically. */
  public dynamic(ref: ApiRef | undefined, display: string, reason: string, offset: number): void {
    this.usages.push({
      kind: 'dynamic',
      api: ref === undefined ? undefined : normalizeRef(ref),
      display,
      reason,
      location: this.location(offset),
    });
  }
}
