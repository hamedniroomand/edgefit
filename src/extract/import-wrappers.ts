import type { Node } from 'oxc-parser';

import { childNodes, staticString, strip } from './ast.ts';

export type ImportWrappers = {
  /** The literal specifier of each call of a followed wrapper, by call. */
  calls: ReadonlyMap<Node, string>;
  /** The `import(param)` inside each followed wrapper. The calls stand for it. */
  imports: ReadonlySet<Node>;
};

type Candidate = { name: string; declaration: Node; importNode: Node };

function importOf(fn: Node): Node | undefined {
  if (
    fn.type !== 'FunctionDeclaration' &&
    fn.type !== 'FunctionExpression' &&
    fn.type !== 'ArrowFunctionExpression'
  ) {
    return undefined;
  }
  const [param] = fn.params;
  if (fn.params.length !== 1 || param?.type !== 'Identifier' || fn.body === null) {
    return undefined;
  }
  let value: Node | null | undefined = fn.body;
  if (fn.body.type === 'BlockStatement') {
    const [only] = fn.body.body;
    value =
      fn.body.body.length === 1 && only?.type === 'ReturnStatement' ? only.argument : undefined;
  }
  const inner = value === null || value === undefined ? undefined : strip(value);
  const source = inner?.type === 'ImportExpression' ? strip(inner.source) : undefined;
  return source?.type === 'Identifier' && source.name === param.name ? inner : undefined;
}

function candidateOf(node: Node): Candidate | undefined {
  if (node.type === 'FunctionDeclaration' && node.id !== null) {
    const importNode = importOf(node);
    return importNode === undefined
      ? undefined
      : { name: node.id.name, declaration: node.id, importNode };
  }
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init !== null) {
    const importNode = importOf(strip(node.init));
    return importNode === undefined
      ? undefined
      : { name: node.id.name, declaration: node.id, importNode };
  }
  return undefined;
}

function exportedNames(node: Node): string[] {
  const declaration =
    node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration'
      ? node.declaration
      : undefined;
  if (declaration?.type === 'FunctionDeclaration') {
    return declaration.id === null ? [] : [declaration.id.name];
  }
  return declaration?.type === 'VariableDeclaration'
    ? declaration.declarations.flatMap(item =>
        item.id.type === 'Identifier' ? [item.id.name] : [],
      )
    : [];
}

/**
 * The functions of a file that only run `import(specifier)` for their one parameter, such as
 * `const load = specifier => import(specifier)`, when every use of the function is a call with a
 * literal. Each such call stands for an `import()` of the literal. A function that is exported,
 * passed on, called with anything else, or whose name is used for another thing is left out.
 */
export function findImportWrappers(body: readonly Node[]): ImportWrappers {
  const candidates: Candidate[] = [];
  const exported = new Set<string>();
  const references = new Map<string, Node[]>();
  const calls: { name: string; callee: Node; call: Node; specifier: string | undefined }[] = [];
  const pending = [...body];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const candidate = candidateOf(node);
    if (candidate !== undefined) {
      candidates.push(candidate);
    }
    for (const name of exportedNames(node)) {
      exported.add(name);
    }
    if (node.type === 'Identifier') {
      references.set(node.name, [...(references.get(node.name) ?? []), node]);
    }
    const callee = node.type === 'CallExpression' ? strip(node.callee) : undefined;
    if (node.type === 'CallExpression' && callee?.type === 'Identifier') {
      const [argument] = node.arguments;
      const specifier = node.arguments.length === 1 ? staticString(argument) : undefined;
      calls.push({ name: callee.name, callee, call: node, specifier });
    }
    pending.push(...childNodes(node));
  }
  const followed = new Map<Node, string>();
  const imports = new Set<Node>();
  for (const { name, declaration, importNode } of candidates) {
    const mine = calls.filter(call => call.name === name);
    const accounted = new Set<Node>([declaration, ...mine.map(call => call.callee)]);
    const unique = candidates.filter(other => other.name === name).length === 1;
    const onlyLiterals = mine.length > 0 && mine.every(call => call.specifier !== undefined);
    const loose = (references.get(name) ?? []).some(reference => !accounted.has(reference));
    if (unique && !exported.has(name) && !loose && onlyLiterals) {
      imports.add(importNode);
      for (const { call, specifier } of mine) {
        followed.set(call, specifier ?? '');
      }
    }
  }
  return { calls: followed, imports };
}
