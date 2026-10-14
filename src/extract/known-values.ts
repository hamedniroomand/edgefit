import type { Node } from 'oxc-parser';

import type { PassedKey } from '@/types.ts';

import { staticKey, strip } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { foldedString } from './bindings.ts';
import { literalOf, presenceOf, propertyKey, spreadLiterals, writtenKeys } from './presence.ts';
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
 * The keys that each object literal always passes with a defined value, kept apart from its known
 * values. A spread or a key that is not known after a key can remove it, see `noteUnknownKey`.
 */
const presentKeys = new WeakMap<KnownObject, PassedKey[]>();

/**
 * A spread or a computed key that is not known may replace each key before it, maybe with
 * `undefined`, so those keys are left out. A spread of known object literals only changes the keys
 * that they write: a key stays only when each path of the spread leaves it defined.
 */
function noteUnknownKey(present: Map<string, PassedKey>, property: Node, scope: Scope): void {
  const spread = spreadLiterals(property, scope, valueOf);
  if (spread === 'none') {
    return;
  }
  const keySets = spread === undefined ? [] : spread.literals.map(literal => writtenKeys(literal));
  const written = keySets.filter(keys => keys !== undefined);
  if (spread === undefined || written.length !== keySets.length) {
    present.clear();
    return;
  }
  const given = spread.literals.map(
    literal => new Map((passedKeysOf(literal, scope) ?? []).map(key => [key.key, key])),
  );
  for (const name of new Set(written.flat())) {
    const before = present.get(name);
    // The value on each path: the literal's own value, or the value before when it does not write the key.
    const outcomes = given.map((own, index) =>
      written[index]?.includes(name) === true ? own.get(name) : before,
    );
    if (!spread.always) {
      outcomes.push(before);
    }
    const [first] = outcomes;
    if (first === undefined || outcomes.includes(undefined)) {
      present.delete(name);
    } else {
      const same = outcomes.every(outcome => outcome?.value === first.value);
      present.set(name, same ? first : { key: name });
    }
  }
}

/** A key whose value may be `undefined` is left out, the same as a key that is not passed. */
function notePresent(
  present: Map<string, PassedKey>,
  property: Node,
  key: string | undefined,
  node: Node | undefined,
  scope: Scope,
  known: KnownValue | undefined,
): void {
  if (key === undefined) {
    noteUnknownKey(present, property, scope);
  } else if (node === undefined || presenceOf(node, scope, valueOf) !== 'defined') {
    present.delete(key);
  } else {
    const literal = literalOf(node, known);
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
    // A method is a function, and a getter or a setter gives a value that is not known.
    const given =
      property.type === 'Property' && property.kind === 'init' ? property.value : undefined;
    const presentKey = propertyKey(property);
    // A Symbol key never names an option, so it changes no option.
    if (presentKey !== null) {
      notePresent(present, property, presentKey, given, scope, value);
    }
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
