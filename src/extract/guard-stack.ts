import type { Node } from 'oxc-parser';

import type { ApiRef, RuntimeCondition } from '@/types.ts';

import { childNodes, isFunction } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { normalizeRef } from './refs.ts';

/** An API that is known to exist inside the code a check protects. */
export interface ApiGuard {
  kind: 'api';
  ref: ApiRef;
  /** The local name the check started from, so reassigning it can end the guard. */
  root: string | undefined;
  active: boolean;
}

/** The runtime is known inside the code a check protects. */
export interface RuntimeGuard {
  kind: 'runtime';
  condition: RuntimeCondition;
}

export type Guard = ApiGuard | RuntimeGuard;

/** Whether `ref` is `guard.ref` or something below it. */
function isCovered(guard: ApiGuard, ref: ApiRef): boolean {
  const target = normalizeRef(ref);
  return (
    guard.active &&
    guard.ref.module === target.module &&
    guard.ref.path.every((segment, index) => target.path[index] === segment)
  );
}

/** Whether code throws, in the code itself rather than in a function it defines. */
function throws(node: Node): boolean {
  return (
    node.type === 'ThrowStatement' ||
    (!isFunction(node) && childNodes(node).some(child => throws(child)))
  );
}

/**
 * Whether a `catch` stops an error that reaches it: it does not throw again, so what follows
 * the `try` runs either way.
 */
export function catches(node: NodeOf<'TryStatement'>): boolean {
  return node.handler !== null && !throws(node.handler.body);
}

/** The guards in force at the point being visited. */
export class GuardStack {
  readonly #guards: Guard[] = [];
  /** How many enclosing `try` blocks in this function catch what they run. */
  #caught = 0;

  /** Runs `body` with `guards` added, and removes them afterwards. */
  public readonly within = (guards: readonly Guard[], body: () => void): void => {
    const depth = this.#guards.length;
    this.#guards.push(...guards);
    try {
      body();
    } finally {
      this.#guards.length = depth;
    }
  };

  /** Runs `body`, which may add guards that last for the rest of a block. */
  public readonly scoped = (body: (add: (guards: readonly Guard[]) => void) => void): void => {
    const depth = this.#guards.length;
    try {
      body(guards => {
        this.#guards.push(...guards);
      });
    } finally {
      this.#guards.length = depth;
    }
  };

  /** Runs `body` inside a `try` block whose `catch` stops the error. */
  public readonly caught = (body: () => void): void => {
    this.#caught += 1;
    try {
      body();
    } finally {
      this.#caught -= 1;
    }
  };

  /**
   * Runs `body` as code that may run later, outside the `try` blocks around it: a function's
   * body, or a promise nothing awaits.
   */
  public readonly deferred = (body: () => void): void => {
    const caught = this.#caught;
    this.#caught = 0;
    try {
      body();
    } finally {
      this.#caught = caught;
    }
  };

  public readonly drop = (name: string): void => {
    for (const guard of this.#guards) {
      if (guard.kind === 'api' && guard.root === name) {
        guard.active = false;
      }
    }
  };

  /** Whether `ref` is only used where it exists, or where a `catch` stops the error of its absence. */
  public readonly covers = (ref: ApiRef): boolean =>
    this.#caught > 0 || this.#guards.some(guard => guard.kind === 'api' && isCovered(guard, ref));

  /** What is known of the runtime at this point. */
  public readonly runtimes = (): RuntimeCondition[] =>
    this.#guards.flatMap(guard => (guard.kind === 'runtime' ? [guard.condition] : []));
}
