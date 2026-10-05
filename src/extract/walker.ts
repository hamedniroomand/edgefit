import type { Node } from 'oxc-parser';

import type { ApiRef } from '@/types.ts';

import { childNodes, isTypeOnly } from './ast.ts';
import {
  computedKey,
  followChain,
  isCheckedOperand,
  isPresentRead,
  isTestedChain,
} from './chain.ts';
import type { VisitContext } from './context.ts';
import {
  displayRef,
  escapes,
  extendedReason,
  findParameterReads,
  isFeatureCheck,
  isAwaitedCall,
  normalizeRef,
  isGlobalRoot,
  memberRef,
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

/** A read that only tests for the API, so it is not a use. */
function isCheck(node: Node, parent: Node | undefined, outer: readonly Node[]): boolean {
  return (
    (parent !== undefined && (isFeatureCheck(node, parent) || isTestedChain(parent, outer))) ||
    isOptionalRead(node, parent)
  );
}

const apiGuard = (ref: ApiRef) =>
  ({ kind: 'api', ref: normalizeRef(ref), root: undefined, active: true }) as const;

export class Walker implements VisitContext {
  public readonly imported: boolean;
  public readonly mainOnlyNodes = new Set<Node>();
  public readonly collector: UsageCollector;
  public readonly globals: ReadonlySet<string>;
  public readonly nodeEnv: string | undefined;
  public readonly typeOnlyImports: ReadonlySet<string>;
  public readonly assigned: ReadonlyMap<string, Node>;
  public readonly wrappers: VisitContext['wrappers'];
  public readonly functions: VisitContext['functions'];
  public readonly supplied: VisitContext['supplied'];
  public readonly callKeys: VisitContext['callKeys'];
  readonly #stack: Node[] = [];
  #scope: Scope = createScope();
  #bound: ReadonlySet<Node> = new Set();

  public constructor(
    collector: UsageCollector,
    globals: ReadonlySet<string>,
    nodeEnv: string | undefined,
    typeOnlyImports: ReadonlySet<string>,
    assigned: ReadonlyMap<string, Node>,
    wrappers: VisitContext['wrappers'],
    functions: VisitContext['functions'],
    supplied: VisitContext['supplied'],
    callKeys: VisitContext['callKeys'],
    imported = false,
  ) {
    this.imported = imported;
    this.collector = collector;
    this.globals = globals;
    this.nodeEnv = nodeEnv;
    this.typeOnlyImports = typeOnlyImports;
    this.assigned = assigned;
    this.wrappers = wrappers;
    this.functions = functions;
    this.supplied = supplied;
    this.callKeys = callKeys;
  }

  public get scope(): Scope {
    return this.#scope;
  }

  public readonly visit = (node: Node | null | undefined): void => {
    if (node === null || node === undefined || isTypeOnly(node)) {
      return;
    }
    if (this.collector.guards.mainOnly()) {
      this.mainOnlyNodes.add(node);
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

  public readonly visitBound = (init: Node, bound: readonly Node[] = [init]): void => {
    const previous = this.#bound;
    this.#bound = new Set(bound);
    try {
      this.visit(init);
    } finally {
      this.#bound = previous;
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
    !this.#bound.has(node) &&
    escapes(node, parent, this.#outer(node));

  /** A computed access: the object is a use, and the key is each string it may be, or unknown. */
  readonly #recordComputed = (
    chain: Extract<ReturnType<typeof followChain>, { kind: 'computed' }>,
  ): void => {
    if (!isGlobalRoot(chain.ref)) {
      this.collector.api(chain.ref, chain.offset);
    }
    const { member, memberParent } = chain;
    const global = isGlobalRoot(chain.ref) && memberParent !== undefined;
    const written = global && isMemberWrite(member, memberParent);
    const checked =
      isPresentRead(member, memberParent, this.scope) ||
      (global && isCheckedOperand(member, memberParent, this.#outer(member), this));
    const tested = memberParent !== undefined && isOnlyTested(member, memberParent, chain.ref);
    if (chain.keys !== undefined) {
      const through = computedKey(member, this.scope);
      for (const key of tested || written ? [] : chain.keys) {
        const ref = memberRef(chain.ref, key);
        this.collector.guards.within(checked ? [apiGuard(ref)] : [], () => {
          this.collector.api(ref, chain.propertyOffset, false, through);
        });
      }
    } else if (!(tested || written || checked)) {
      this.collector.dynamic(
        chain.ref,
        `${displayRef(chain.ref)}[<expression>]`,
        'accessed with a computed property',
        chain.propertyOffset,
      );
    }
  };

  /** The read of an operand of `||` or `??` checks for the API, and the value goes on: absence is handled, a throw is not. */
  readonly #recordChecked = (ref: ApiRef, offset: number, node: Node, parent: Node): boolean => {
    if (!isCheckedOperand(node, parent, this.#outer(node), this)) {
      return false;
    }
    this.collector.guards.within([apiGuard(ref)], () => {
      this.collector.api(ref, offset);
    });
    return true;
  };

  /**
   * A value passed to a function of the file that only reads members of that parameter is a use
   * of those members. The same goes for a value in an object literal that is passed that way. A
   * member that a class extends is a use of the class and of its instance members.
   */
  readonly #followIntoFunction = (ref: ApiRef, node: Node, parent: Node): boolean => {
    const reads = findParameterReads(node, parent, this.#outer(node), this.functions);
    for (const read of reads ?? []) {
      const member = { ...ref, path: [...ref.path, ...read.path] };
      if (read.path.length > 0) {
        this.collector.api(member, read.offset);
      }
      if (read.extended) {
        const instances = memberRef(member, 'prototype');
        this.collector.dynamic(instances, displayRef(member), extendedReason, read.offset);
      }
    }
    return reads !== undefined;
  };

  readonly #awaited = (node: Node, parent: Node | undefined): boolean =>
    parent !== undefined && isAwaitedCall(node, parent, this.#outer(node));

  public readonly useRef = (ref: ApiRef, offset: number, recordBare = true): void => {
    const chain = followChain(this.#stack, ref, offset, this.#scope);
    if (chain.kind === 'computed') {
      this.#recordComputed(chain);
      return;
    }
    const { node, parent } = chain;
    if (isGlobalRoot(chain.ref) || isCheck(node, parent, this.#outer(node))) {
      return;
    }
    if (parent !== undefined && this.#recordChecked(chain.ref, chain.offset, node, parent)) {
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
    if (
      parent !== undefined &&
      this.#escapes(chain.ref, node, parent) &&
      !this.#followIntoFunction(chain.ref, node, parent)
    ) {
      this.collector.dynamic(
        chain.ref,
        displayRef(chain.ref),
        'passed on as a value, so its members may be used elsewhere',
        chain.offset,
      );
    }
  };
}
