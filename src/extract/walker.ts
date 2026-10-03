import type { Node } from 'oxc-parser';

import type { ApiRef } from '@/types.ts';

import { childNodes, isTypeOnly } from './ast.ts';
import { followChain } from './chain.ts';
import type { VisitContext } from './context.ts';
import {
  displayRef,
  escapes,
  isFeatureCheck,
  isGlobalRoot,
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

  public readonly useRef = (ref: ApiRef, offset: number, recordBare = true): void => {
    const chain = followChain(this.#stack, ref, offset, this.#scope);
    if (chain.kind === 'computed') {
      if (!isGlobalRoot(chain.ref)) {
        this.collector.api(chain.ref, chain.offset);
      }
      // `typeof x[key]` only tests for a member, so there is nothing to follow.
      if (chain.memberParent === undefined || !isFeatureCheck(chain.member, chain.memberParent)) {
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
      (parent !== undefined && isFeatureCheck(node, parent)) ||
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
      this.collector.api(chain.ref, chain.offset);
    }
    // Globals are reachable from any code, so passing one on hides nothing new.
    const fromGlobal = chain.ref.module === '*globals*';
    if (!fromGlobal && parent !== undefined && this.#boundInit !== node && escapes(node, parent)) {
      this.collector.dynamic(
        chain.ref,
        displayRef(chain.ref),
        'passed on as a value, so its members may be used elsewhere',
        chain.offset,
      );
    }
  };
}
