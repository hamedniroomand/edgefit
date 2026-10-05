import type { Node } from 'oxc-parser';

import {
  childNodes,
  isFunction,
  isTypeOnly,
  staticKey,
  strip,
  stringLiteral,
} from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';

// Helpers that compiled code wraps a `require` in; what they return has the members of the module.
export const interopWrappers = new Set([
  '_interop_require_default',
  '_interop_require_wildcard',
  '__toESM',
  '__toModule',
  '__importDefault',
  '__importStar',
]);
// Helpers that copy every export of a module onto this one.
export const starHelpers = new Set(['_export_star', '__exportStar', '__reExport']);
/** Whether the name is one that compiled code gives to a helper whose body handles modules. */
export const isHelperName = (name: string): boolean =>
  interopWrappers.has(name) || starHelpers.has(name);
// Names that make a module read its own exports or run code from text, so nothing is known about it.
export const opaqueNames = new Set(['module', 'exports', 'eval']);

/** The helpers a module defines or imports at its top level. */
export type Helpers = {
  all: Set<string>;
  getters: Set<string>;
  /** `object.member` for a member of an imported helper module, and the helper that it is. */
  members: Map<string, string>;
};

export type Call = NodeOf<'CallExpression'>;
export type ObjectLiteral = NodeOf<'ObjectExpression'>;

/** The key a unit for an export is filed under; it can never be the name of a variable. */
export const exportKey = (name: string): string => `export:${name}`;

export function isName(node: Node | null | undefined, name: string | undefined): boolean {
  return node?.type === 'Identifier' && node.name === name;
}

/** `exports` or `module.exports`. */
export function isExportsObject(node: Node): boolean {
  const inner = strip(node);
  return (
    isName(inner, 'exports') ||
    (inner.type === 'MemberExpression' &&
      !inner.computed &&
      isName(inner.object, 'module') &&
      isName(inner.property, 'exports'))
  );
}

/** `require('specifier')` with the specifier written out. */
export function requireCall(node: Node): { call: Call; specifier: string } | undefined {
  const inner = strip(node);
  if (inner.type !== 'CallExpression' || !isName(inner.callee, 'require')) {
    return undefined;
  }
  const [argument] = inner.arguments;
  const specifier = argument === undefined ? undefined : stringLiteral(argument);
  return inner.arguments.length === 1 && specifier !== undefined
    ? { call: inner, specifier }
    : undefined;
}

/** What is asked of a `require`, and through which wrapper. */
export interface RequireUse {
  call: Call;
  specifier: string;
  /** The member that is read from the result, if it is read straight away. */
  member: string | undefined;
}

/**
 * `require('s')`, `require('s').member`, or either one inside a wrapper that passes the module
 * through, as `_interop_require_wildcard(require('s'))` does.
 */
export function requiredBy(node: Node, helpers: Helpers): RequireUse | undefined {
  let inner = strip(node);
  let member: string | undefined;
  if (
    inner.type === 'MemberExpression' &&
    !inner.computed &&
    inner.property.type === 'Identifier'
  ) {
    member = inner.property.name;
    inner = strip(inner.object);
  }
  if (
    member === undefined &&
    inner.type === 'CallExpression' &&
    interopWrappers.has(helperName(inner.callee, helpers) ?? '') &&
    inner.arguments.length > 0 &&
    inner.arguments[0] !== undefined
  ) {
    inner = strip(inner.arguments[0]);
  }
  const found = requireCall(inner);
  return found === undefined ? undefined : { ...found, member };
}

/**
 * The helper that a callee names: a top-level function, or a member of an imported helper module
 * such as `_interop_require_default._` or `tslib_1.__importStar`.
 */
export function helperName(callee: Node, helpers: Helpers): string | undefined {
  const inner = strip(callee);
  if (inner.type === 'Identifier') {
    return helpers.all.has(inner.name) ? inner.name : undefined;
  }
  return inner.type === 'MemberExpression' &&
    !inner.computed &&
    inner.object.type === 'Identifier' &&
    inner.property.type === 'Identifier'
    ? helpers.members.get(`${inner.object.name}.${inner.property.name}`)
    : undefined;
}

/** The function that `(this && this.name) || function () {}`, as tsc emits its helpers, falls back to. */
function fallbackFunction(node: Node, name: string): Node | undefined {
  if (node.type !== 'LogicalExpression' || node.operator !== '||') {
    return undefined;
  }
  const left = strip(node.left);
  const right = strip(node.right);
  const member = left.type === 'LogicalExpression' ? strip(left.right) : undefined;
  const isFallback =
    left.type === 'LogicalExpression' &&
    left.operator === '&&' &&
    strip(left.left).type === 'ThisExpression' &&
    member?.type === 'MemberExpression' &&
    !member.computed &&
    strip(member.object).type === 'ThisExpression' &&
    isName(member.property, name);
  const isIife = right.type === 'CallExpression' && isFunction(strip(right.callee));
  return isFallback && (isFunction(right) || isIife) ? right : undefined;
}

/** Whether a function copies each property of its second argument as a getter: `_export(target, all)`. */
export function definesGetters(node: Node): boolean {
  if (!isFunction(node) || node.params.length !== 2) {
    return false;
  }
  const [, all] = node.params;
  const allName = all?.type === 'Identifier' ? all.name : undefined;
  let found = false;
  const visit = (current: Node): void => {
    if (current.type === 'ForInStatement' && isName(current.right, allName)) {
      found = true;
    }
    for (const child of childNodes(current)) {
      visit(child);
    }
  };
  visit(node.body as Node);
  return found;
}

/** The helpers at the top level: functions, and members of the `@swc/helpers` and `tslib` modules. */
export function topLevelFunctions(body: readonly Node[]): Helpers {
  const all = new Set<string>();
  const getters = new Set<string>();
  const members = new Map<string, string>();
  const add = (name: string, fn: Node): void => {
    all.add(name);
    if (definesGetters(fn)) {
      getters.add(name);
    }
  };
  for (const statement of body) {
    if (statement.type === 'FunctionDeclaration' && statement.id !== null) {
      add(statement.id.name, statement);
    } else if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations) {
        const init = declarator.init === null ? undefined : strip(declarator.init);
        if (declarator.id.type !== 'Identifier' || init === undefined) {
          continue;
        }
        const { name } = declarator.id;
        const fn = isFunction(init) ? init : fallbackFunction(init, name);
        if (fn === undefined) {
          addModuleHelpers(members, name, requireCall(init)?.specifier);
        } else {
          add(name, fn);
        }
      }
    }
  }
  return { all, getters, members };
}

// The only helpers that tslib defines which pass a `require` through.
const tslibHelpers = ['__importDefault', '__importStar', '__exportStar'];
const swcHelperModule = /^@swc\/helpers\/_\/([^/]+)$/u;

function addModuleHelpers(
  members: Map<string, string>,
  local: string,
  specifier: string | undefined,
): void {
  const swc = specifier === undefined ? undefined : swcHelperModule.exec(specifier)?.[1];
  if (swc !== undefined) {
    members.set(`${local}._`, swc);
  } else if (specifier === 'tslib') {
    for (const name of tslibHelpers) {
      members.set(`${local}.${name}`, name);
    }
  }
}

/** Every `require('specifier')` call in the module. */
export function requireCalls(node: Node, calls: Call[] = []): Call[] {
  if (isTypeOnly(node)) {
    return calls;
  }
  if (requireCall(node)?.call === node) {
    calls.push(node as Call);
  }
  for (const child of childNodes(node)) {
    requireCalls(child, calls);
  }
  return calls;
}

/** `void 0`, possibly assigned to several exports at once: `exports.a = exports.b = void 0`. */
export function isVoidChain(node: Node): boolean {
  let current = strip(node);
  while (current.type === 'AssignmentExpression' && isExportsMember(current.left)) {
    current = strip(current.right);
  }
  return current.type === 'UnaryExpression' && current.operator === 'void';
}

export function isExportsMember(node: Node): boolean {
  const inner = strip(node);
  return inner.type === 'MemberExpression' && isExportsObject(inner.object);
}

export function isModuleExports(node: Node): boolean {
  const inner = strip(node);
  return (
    inner.type === 'MemberExpression' &&
    !inner.computed &&
    isName(inner.object, 'module') &&
    isName(inner.property, 'exports')
  );
}

/** The names `const { a, b: c } = …` takes, as `[local, imported, property]`, when it takes plain names. */
export function destructuredNames(
  pattern: NodeOf<'ObjectPattern'>,
): [string, string, Node][] | undefined {
  const names: [string, string, Node][] = [];
  for (const property of pattern.properties) {
    if (property.type !== 'Property' || property.computed) {
      return undefined;
    }
    const imported = staticKey(property.key, false);
    const { value } = property;
    if (imported === undefined || value.type !== 'Identifier') {
      return undefined;
    }
    names.push([value.name, imported, property]);
  }
  return names;
}

/** Whether the assignment is `module.exports = name`. */
export function assignsExports(node: NodeOf<'AssignmentExpression'>, name: string): boolean {
  return node.operator === '=' && isModuleExports(node.left) && isName(strip(node.right), name);
}
