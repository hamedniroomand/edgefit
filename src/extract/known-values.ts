import type { Node } from 'oxc-parser';

import type { PassedKey } from '@/types.ts';

import { staticKey, strip } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { foldedString } from './bindings.ts';
import { createScope, declare, lookupKeys, lookupObject } from './scope.ts';
import type { KnownObject, KnownValue, Scope } from './scope.ts';

/** The strings of `values`, when there is at least one and each one is a string. */
function strings(values: readonly KnownValue[] | undefined): readonly string[] | undefined {
  // An empty set says nothing, and silence is not an answer.
  if (values === undefined || values.length === 0) {
    return undefined;
  }
  return values.every(value => typeof value === 'string') ? [...new Set(values)] : undefined;
}

/** Each set joined into one, unless one of them is not known. */
export function unionKeys(
  sets: readonly (readonly string[] | undefined)[],
): readonly string[] | undefined {
  return sets.every(set => set !== undefined) ? strings(sets.flat()) : undefined;
}

/** The object of `values` by their position, with the values that are known. */
function knownObject(
  values: readonly (KnownValue | undefined)[],
  entries: ReadonlyMap<string, KnownValue>,
): KnownObject {
  return {
    entries,
    values: values.every(value => value !== undefined) ? (values as KnownValue[]) : undefined,
  };
}

function arrayValue(node: NodeOf<'ArrayExpression'>, scope: Scope): KnownObject | undefined {
  // A hole or a spread moves the index of each element after it.
  if (node.elements.some(element => element === null || element.type === 'SpreadElement')) {
    return undefined;
  }
  const values = node.elements.map(element =>
    element === null ? undefined : valueOf(element, scope),
  );
  const entries = values.flatMap((value, index) =>
    value === undefined ? [] : [[String(index), value] as const],
  );
  return knownObject(values, new Map(entries));
}

/**
 * The keys that each object literal has, kept apart from its known values: a key stays when its
 * value is not known, and a spread after it only makes its value unknown.
 */
const presentKeys = new WeakMap<KnownObject, PassedKey[]>();

const isPlainLiteral = (node: Node): node is NodeOf<'Literal'> & { value: boolean | number } =>
  node.type === 'Literal' && (typeof node.value === 'boolean' || typeof node.value === 'number');

/** A literal value: a boolean or a number in the source, `!0` or `!1` as minifiers write them, or a known string. */
function literalOf(node: Node, value: KnownValue | undefined): PassedKey['value'] {
  const inner = strip(node);
  if (isPlainLiteral(inner)) {
    return inner.value;
  }
  const negated =
    inner.type === 'UnaryExpression' && inner.operator === '!' ? inner.argument : undefined;
  if (negated?.type === 'Literal' && typeof negated.value === 'number') {
    return negated.value === 0;
  }
  return typeof value === 'string' ? value : undefined;
}

/** `undefined` or `void 0`: a key with this value is the same as a key that is not passed. */
function isUndefinedValue(node: Node): boolean {
  const inner = strip(node);
  return (
    (inner.type === 'Identifier' && inner.name === 'undefined') ||
    (inner.type === 'UnaryExpression' && inner.operator === 'void')
  );
}

/** A key that is not known, such as a spread, may replace the value of each key before it. */
function notePresent(
  present: Map<string, PassedKey>,
  key: string | undefined,
  node: Node | undefined,
  known: KnownValue | undefined,
): void {
  if (key === undefined) {
    for (const name of present.keys()) present.set(name, { key: name });
  } else if (node !== undefined && isUndefinedValue(node)) {
    present.delete(key);
  } else {
    const literal = node === undefined ? undefined : literalOf(node, known);
    present.set(key, literal === undefined ? { key } : { key, value: literal });
  }
}

/** A later property replaces an earlier one, so a key that is not known hides each one before it. */
function objectValue(node: NodeOf<'ObjectExpression'>, scope: Scope): KnownObject {
  const entries = new Map<string, KnownValue>();
  const present = new Map<string, PassedKey>();
  const values = node.properties.map(property => {
    const plain = property.type === 'Property' && property.kind === 'init' && !property.method;
    const key =
      property.type === 'Property' ? staticKey(property.key, property.computed) : undefined;
    const value = plain ? valueOf(property.value, scope) : undefined;
    notePresent(present, key, plain ? property.value : undefined, value);
    if (key === undefined) {
      entries.clear();
    } else if (value === undefined) {
      entries.delete(key);
    } else {
      entries.set(key, value);
    }
    return value;
  });
  const object = knownObject(values, entries);
  presentKeys.set(object, [...present.values()]);
  return object;
}

/** The keys an argument passes: those of an object literal, or of a name that holds one. */
export function passedKeysOf(node: Node, scope: Scope): readonly PassedKey[] | undefined {
  const value = valueOf(node, scope);
  return typeof value === 'object' ? presentKeys.get(value) : undefined;
}

/** `list.map(item => item + 'Array')`: each string of `list`, joined as the callback joins it. */
function mappedValue(node: NodeOf<'CallExpression'>, scope: Scope): KnownObject | undefined {
  const callee = strip(node.callee);
  const [mapper] = node.arguments;
  const list =
    callee.type === 'MemberExpression' && staticKey(callee.property, callee.computed) === 'map'
      ? objectOf(callee.object, scope)
      : undefined;
  const [param] = mapper?.type === 'ArrowFunctionExpression' ? mapper.params : [];
  if (
    list === undefined ||
    node.arguments.length !== 1 ||
    mapper?.type !== 'ArrowFunctionExpression' ||
    mapper.body.type === 'BlockStatement' ||
    param?.type !== 'Identifier'
  ) {
    return undefined;
  }
  const { body } = mapper;
  const map = (value: KnownValue): string | undefined => {
    const inner = createScope(scope);
    declare(inner, [param.name]);
    if (typeof value === 'string') {
      inner.strings.set(param.name, value);
    }
    return foldedString(body, inner);
  };
  const values = list.values?.map(map);
  return {
    entries: new Map(
      [...list.entries].flatMap(([key, value]) => {
        const mapped = map(value);
        return mapped === undefined ? [] : [[key, mapped] as const];
      }),
    ),
    values: values?.every(value => value !== undefined) === true ? (values as string[]) : undefined,
  };
}

/** The objects an expression may be: a known object, or each element of a read of a list of objects. */
function objectsOf(node: Node, scope: Scope): readonly KnownObject[] | undefined {
  const inner = strip(node);
  const values =
    inner.type === 'MemberExpression' ? memberValues(inner, scope) : [valueOf(inner, scope)];
  return values?.every(value => typeof value === 'object') === true
    ? (values as KnownObject[])
    : undefined;
}

/** The values a member read may give: one for each key it may have, in each object it may read. */
function memberValues(
  node: NodeOf<'MemberExpression'>,
  scope: Scope,
): readonly KnownValue[] | undefined {
  const objects = objectsOf(node.object, scope);
  const key = staticKey(node.property, node.computed);
  const keys = key === undefined && node.computed ? keysOf(node.property, scope) : undefined;
  if (objects === undefined || (key === undefined && !node.computed)) {
    return undefined;
  }
  const found = objects.map(object => {
    if (key === undefined && keys === undefined) {
      return object.values;
    }
    const values = (key === undefined ? (keys ?? []) : [key]).map(name => object.entries.get(name));
    return values.every(value => value !== undefined) ? values : undefined;
  });
  return found.every(values => values !== undefined) ? found.flat() : undefined;
}

const readers: {
  [TType in Node['type']]?: (node: NodeOf<TType>, scope: Scope) => KnownValue | undefined;
} = {
  Identifier: (node, scope) => {
    const keys = lookupKeys(scope, node.name);
    return lookupObject(scope, node.name) ?? (keys?.length === 1 ? keys[0] : undefined);
  },
  ArrayExpression: arrayValue,
  ObjectExpression: objectValue,
  CallExpression: mappedValue,
  MemberExpression: (node, scope) => {
    const values = memberValues(node, scope);
    return values?.length === 1 ? values[0] : undefined;
  },
};

/** The value an expression always has, when it is known. */
export function valueOf(node: Node, scope: Scope): KnownValue | undefined {
  const inner = strip(node);
  const reader = readers[inner.type] as
    | ((node: Node, scope: Scope) => KnownValue | undefined)
    | undefined;
  return foldedString(inner, scope) ?? reader?.(inner, scope);
}

function objectOf(node: Node, scope: Scope): KnownObject | undefined {
  const value = valueOf(node, scope);
  return typeof value === 'object' ? value : undefined;
}

/** The strings an expression may be: a string, a name that holds one of a set, or a read of a known object. */
export function keysOf(node: Node, scope: Scope): readonly string[] | undefined {
  const inner = strip(node);
  const text = foldedString(inner, scope);
  if (text !== undefined) {
    return [text];
  }
  if (inner.type === 'Identifier') {
    return lookupKeys(scope, inner.name);
  }
  return inner.type === 'MemberExpression' ? strings(memberValues(inner, scope)) : undefined;
}

/** The strings a loop over `node` gives, when it is a known array or object of strings. */
export function elementsOf(node: Node, scope: Scope): readonly string[] | undefined {
  return strings(objectOf(node, scope)?.values);
}
