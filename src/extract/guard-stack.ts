import type { ApiRef, GlobalCondition, RuntimeCondition } from '@/types.ts';

import type { ComputedKey } from './chain.ts';
import { normalizeRef } from './refs.ts';

/** An API that is known to exist inside the code a check protects. */
export interface ApiGuard {
  kind: 'api';
  ref: ApiRef;
  /** The local name the check started from, so reassigning it can end the guard. */
  root: string | undefined;
  /** The name a computed read uses as its key: the guard covers only `obj[key]` with that name. */
  key?: ComputedKey;
  active: boolean;
}

/** The runtime is known inside the code a check protects. */
export interface RuntimeGuard {
  kind: 'runtime';
  condition: RuntimeCondition;
}

/** A global is known to be there (`present`) or not inside the code a check protects. */
export type GlobalGuard = {
  kind: 'global';
  condition: GlobalCondition;
};

/** The code never runs, because a bundler removes it: `process.env.NODE_ENV` is a constant. */
export interface DeadGuard {
  kind: 'dead';
  main?: boolean;
}

/** The API is known to be missing inside the code a check protects. */
export interface AbsentGuard {
  kind: 'absent';
  ref: ApiRef;
}

/** The code stores a value in a global that it only sets when the global is missing. */
export interface PolyfillGuard {
  kind: 'polyfill';
  ref: ApiRef;
}

/** The code runs only when an option that its function gets is set: `if (options.http2)`. */
export interface OptionGuard {
  kind: 'option';
  name: string;
}

export type Guard =
  | ApiGuard
  | RuntimeGuard
  | GlobalGuard
  | DeadGuard
  | AbsentGuard
  | PolyfillGuard
  | OptionGuard;

/** Whether `ref` is `guard.ref` or something below it. */
function isCovered(guard: ApiGuard, ref: ApiRef): boolean {
  const target = normalizeRef(ref);
  return (
    guard.active &&
    guard.ref.module === target.module &&
    guard.ref.path.every((segment, index) => target.path[index] === segment)
  );
}

/** The guards in force at the point being visited. */
export class GuardStack {
  readonly #guards: Guard[] = [];
  /** How many enclosing `try` blocks in this function catch what they run. */
  #caught = 0;
  /** Missing-module error codes that an enclosing `catch` does not throw again. */
  #missing: ReadonlySet<string> = new Set();
  /** The modules that a load in an enclosing `try` block read, where the `catch` stops the error of a missing module. */
  #loaded: readonly string[] = [];

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

  /** Runs `body` where a `catch` stops a missing module with one of `codes`, and not every error. */
  public readonly withinMissing = (codes: ReadonlySet<string>, body: () => void): void => {
    const previous = this.#missing;
    const loaded = this.#loaded;
    const next = new Set(previous);
    for (const code of codes) {
      next.add(code);
    }
    this.#missing = next;
    try {
      body();
    } finally {
      this.#missing = previous;
      this.#loaded = loaded;
    }
  };

  /** Whether a `catch` around this point stops a missing module with `code`. */
  public readonly missingCode = (code: string): boolean => this.#missing.has(code);

  /**
   * Marks `module` as loaded for the rest of the `try` block. When the module is missing, the load
   * throws, so the code after it does not run. A member that is missing from a module that is
   * there throws another error, which the `catch` does not stop.
   */
  public readonly loaded = (module: string): void => {
    this.#loaded = [...this.#loaded, module];
  };

  /** Whether `ref` is read after a load of its module that a `catch` stops when the module is missing. */
  public readonly afterLoad = (ref: ApiRef): boolean => this.#loaded.includes(ref.module);

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
    const missing = this.#missing;
    const loaded = this.#loaded;
    this.#caught = 0;
    this.#missing = new Set();
    this.#loaded = [];
    try {
      body();
    } finally {
      this.#caught = caught;
      this.#missing = missing;
      this.#loaded = loaded;
    }
  };

  public readonly drop = (name: string): void => {
    for (const guard of this.#guards) {
      if (guard.kind === 'api' && (guard.root === name || guard.key?.name === name)) {
        guard.active = false;
      }
    }
  };

  /** Whether a `catch` around this point stops an error from the code. */
  public readonly isCaught = (): boolean => this.#caught > 0;

  /** Whether `ref` is only used where it exists, or where a `catch` stops the error of its absence. */
  public readonly covers = (ref: ApiRef, key?: ComputedKey): boolean =>
    this.isCaught() ||
    this.#guards.some(
      guard =>
        guard.kind === 'api' &&
        (guard.key === undefined ||
          (guard.key.name === key?.name && guard.key.scope === key.scope)) &&
        isCovered(guard, ref),
    );

  /** Whether a check says `ref` is missing at this point. */
  public readonly absent = (ref: ApiRef): boolean =>
    this.#guards.some(
      guard =>
        guard.kind === 'absent' &&
        guard.ref.module === ref.module &&
        guard.ref.path.join('.') === ref.path.join('.'),
    );

  /**
   * The global the code at this point stores a value in only when it is missing.
   * ponytail: only the innermost store counts, so `a ??= (b ??= m)` is judged by `b` alone.
   * Upgrade: keep every ref and guard when the target has any one of them.
   */
  public readonly polyfill = (): ApiRef | undefined =>
    this.#guards.findLast(guard => guard.kind === 'polyfill')?.ref;

  /** Whether a bundler removes the code at this point. */
  public readonly dead = (): boolean => this.#guards.some(guard => guard.kind === 'dead');

  /** Whether the code runs only when the file is the CommonJS entry module. */
  public readonly mainOnly = (): boolean =>
    this.#guards.some(guard => guard.kind === 'dead' && guard.main === true);

  /** The options that the code at this point runs only with. */
  public readonly options = (): string[] => [
    ...new Set(this.#guards.flatMap(guard => (guard.kind === 'option' ? [guard.name] : []))),
  ];

  /** What is known of the runtime at this point. */
  public readonly runtimes = (): RuntimeCondition[] =>
    this.#guards.flatMap(guard => (guard.kind === 'runtime' ? [guard.condition] : []));

  /** What is known of the globals at this point. */
  public readonly globals = (): GlobalCondition[] =>
    this.#guards.flatMap(guard => (guard.kind === 'global' ? [guard.condition] : []));
}
