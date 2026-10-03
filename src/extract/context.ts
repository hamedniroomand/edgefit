import type { Node } from 'oxc-parser';

import type { ApiRef } from '@/types.ts';

import type { BindingContext } from './bindings.ts';
import type { ImportWrappers } from './import-wrappers.ts';
import type { Scope } from './scope.ts';
import type { UsageCollector } from './usage-collector.ts';

export interface VisitContext extends BindingContext {
  readonly collector: UsageCollector;
  /** Imported names that nothing reads as a value, so the bundler drops them. */
  readonly typeOnlyImports: ReadonlySet<string>;
  /** The value of each name that is set once after its declaration, from `findAssigned`. */
  readonly assigned: ReadonlyMap<string, Node>;
  /** The functions that only run `import()` for their argument, from `findImportWrappers`. */
  readonly wrappers: ImportWrappers;
  visit: (node: Node | null | undefined) => void;
  visitAll: (nodes: readonly (Node | null)[]) => void;
  visitChildren: (node: Node) => void;
  visitPattern: (pattern: Node | null | undefined) => void;
  /** Visits an expression whose value is bound to a name, so it is followed rather than escaping. */
  visitBound: (init: Node) => void;
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
