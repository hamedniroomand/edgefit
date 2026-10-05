import type { Node } from 'oxc-parser';

import type { ApiRef } from '@/types.ts';

import type { BindingContext } from './bindings.ts';
import type { CallKeys } from './call-keys.ts';
import type { LocalFunction } from './local-functions.ts';
import type { Scope } from './scope.ts';
import type { UsageCollector } from './usage-collector.ts';

export interface VisitContext extends BindingContext {
  readonly collector: UsageCollector;
  /** Imported names that nothing reads as a value, so the bundler drops them. */
  readonly typeOnlyImports: ReadonlySet<string>;
  /** The value of each name that is set once after its declaration, from `findAssigned`. */
  readonly assigned: ReadonlyMap<string, Node>;
  /** The `require()` and `import()` of a name that a parameter of the enclosing function gives, see `findSuppliedLoads`. */
  readonly supplied: ReadonlySet<Node>;
  /** The functions that a plain name of the file stands for, see `findLocalFunctions`. */
  readonly functions: ReadonlyMap<string, LocalFunction>;
  /** The strings that each parameter of a local function holds, from `findCallKeys`. */
  readonly callKeys: CallKeys;
  visit: (node: Node | null | undefined) => void;
  visitAll: (nodes: readonly (Node | null)[]) => void;
  visitChildren: (node: Node) => void;
  visitPattern: (pattern: Node | null | undefined) => void;
  /**
   * Visits an expression whose value is bound to a name, so it is followed rather than escaping.
   * `bound` lists the values inside it that are bound, when they are not the expression itself.
   */
  visitBound: (init: Node, bound?: readonly Node[]) => void;
  inScope: (scope: Scope, body: () => void) => void;
  /** The parent of the node being visited. */
  parent: () => Node | undefined;
  /** Runs `body` with `node` on the ancestor stack without dispatching it. */
  withAncestor: (node: Node, body: () => void) => void;
  /**
   * Records a use of `ref` found at the top of the ancestor stack, extended through any
   * member accesses around it. `recordBare` is false when the unextended ref was already recorded.
   */
  useRef: (ref: ApiRef, offset: number, recordBare?: boolean) => void;
}

export type Visitor<T extends Node = Node> = (node: T, context: VisitContext) => void;
