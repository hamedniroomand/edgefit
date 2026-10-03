import type { Node } from 'oxc-parser';

import type { ApiRef } from '@/types.ts';

import { childNodes, isTypeOnly } from './ast.ts';
import { followChain, isTestedChain } from './chain.ts';
import type { VisitContext } from './context.ts';
import {
  displayRef,
  escapes,
  isFeatureCheck,
  isAwaitedCall,
  isGlobalRoot,
  isOnlyTested,
  isMemberWrite,
  isOptionalRead,
  writtenObject,
} from './refs.ts';
import { createScope } from './scope.ts';
import type { Scope } from './scope.ts';
import type { UsageCollector } from './usage-collector.ts';
import { visitorFor } from './visitors/index.ts';
import { visitPattern } from './visitors/patterns.ts';

export class Walker implements VisitContext {
  public readonly collector: UsageCollector;
  public readonly globals: ReadonlySet<string>;
  public readonly nodeEnv: string | undefined;
  public readonly typeOnlyImports: ReadonlySet<string>;
  public readonly assigned: ReadonlyMap<string, Node>;
  public readonly wrappers: VisitContext['wrappers'];
  readonly #stack: Node[] = [];
  #scope: Scope = createScope();
  #boundInit: Node | undefined;

  public constructor(
    collector: UsageCollector,
    globals: ReadonlySet<string>,
    nodeEnv: string | undefined,
    typeOnlyImports: ReadonlySet<string>,
    assigned: ReadonlyMap<string, Node>,
    wrappers: VisitContext['wrappers'],
  ) {
    this.collector = collector;
    this.globals = globals;
    this.nodeEnv = nodeEnv;
    this.typeOnlyImports = typeOnlyImports;
    this.assigned = assigned;
    this.wrappers = wrappers;
  }

  public get scope(): Scope {
    return this.#scope;
  }

  public readonly visit = (node: Node | null | undefined): void => {
    if (node === null || node === undefined || isTypeOnly(node)) {
      return;
    }
    this.withAncestor(node, () => {
      const visitor = visitorFor(node);
      if (visitor === undefined) {
        this.visitChildren(node);
      } else {
        visitor(node, this);
      }
    });
  };

  public readonly visitAll = (nodes: readonly (Node | null)[]): void => {
    for (const node of nodes) {
      this.visit(node);
    }
  };

  public readonly visitChildren = (node: Node): void => {
    this.visitAll(childNodes(node));
  };

  public readonly visitPattern = (pattern: Node | null | undefined): void => {
    visitPattern(pattern, this);
  };

  public readonly visitBound = (init: Node): void => {
    const previous = this.#boundInit;
    this.#boundInit = init;
    try {
      this.visit(init);
    } finally {
      this.#boundInit = previous;
    }
  };

  public readonly inScope = (scope: Scope, body: () => void): void => {
    const previous = this.#scope;
    this.#scope = scope;
    try {
      body();
    } finally {
      this.#scope = previous;
    }
  };

  public readonly parent = (): Node | undefined => this.#stack.at(-2);

  public readonly withAncestor = (node: Node, body: () => void): void => {
    this.#stack.push(node);
    try {
      body();
    } finally {
      this.#stack.pop();
    }
  };

  /** The ancestors above the parent of `node`, nearest first. */
  readonly #outer = (node: Node): Node[] =>
    this.#stack.slice(0, this.#stack.lastIndexOf(node) - 1).reverse();

  /** Whether the value flows where its members may be used. Globals are reachable from any code, so passing one on hides nothing new. */
  readonly #escapes = (ref: ApiRef, node: Node, parent: Node): boolean =>
    ref.module !== '*globals*' &&
    this.#boundInit !== node &&
    escapes(node, parent, this.#outer(node));

  readonly #awaited = (node: Node, parent: Node | undefined): boolean =>
    parent !== undefined && isAwaitedCall(node, parent, this.#outer(node));

  public readonly useRef = (ref: ApiRef, offset: number, recordBare = true): void => {
    const chain = followChain(this.#stack, ref, offset, this.#scope);
    if (chain.kind === 'computed') {
      if (!isGlobalRoot(chain.ref)) {
        this.collector.api(chain.ref, chain.offset);
      }
      // A test for a member, or a global that is only compared, has nothing to follow.
      if (
        chain.memberParent === undefined ||
        !isOnlyTested(chain.member, chain.memberParent, chain.ref)
      ) {
        this.collector.dynamic(
          chain.ref,
          `${displayRef(chain.ref)}[<expression>]`,
          'accessed with a computed property',
          chain.propertyOffset,
        );
      }
      return;
    }
    const { node, parent } = chain;
    if (
      isGlobalRoot(chain.ref) ||
      (parent !== undefined &&
        (isFeatureCheck(node, parent) || isTestedChain(parent, this.#outer(node)))) ||
      isOptionalRead(node, parent)
    ) {
      return;
    }
    if (parent !== undefined && isMemberWrite(node, parent)) {
      // Setting a missing member does not throw, but reading its object does.
      const target = writtenObject(chain.ref, node);
      if (target.ref.path.length > 0 && !isGlobalRoot(target.ref)) {
        this.collector.api(target.ref, target.offset);
      }
      return;
    }
    if (recordBare || chain.extended) {
      this.collector.api(chain.ref, chain.offset, this.#awaited(node, parent));
    }
    if (parent !== undefined && this.#escapes(chain.ref, node, parent)) {
      this.collector.dynamic(
        chain.ref,
        displayRef(chain.ref),
        'passed on as a value, so its members may be used elsewhere',
        chain.offset,
      );
    }
  };
}
