import type { Class, Node } from 'oxc-parser';

import { pushChildNodes, strip } from './ast.ts';
import { declarationCounts } from './local-functions.ts';

/** A class that a plain name stands for: `class M {}` or `const M = class {}`. */
function classOf(node: Node): { name: string; cls: Class } | undefined {
  if (node.type === 'ClassDeclaration' && node.id !== null) {
    return { name: node.id.name, cls: node };
  }
  if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier' || node.init === null) {
    return undefined;
  }
  const init = strip(node.init);
  return init.type === 'ClassExpression' ? { name: node.id.name, cls: init } : undefined;
}

/**
 * The classes of a file that a plain name stands for. A name that anything else in the file
 * declares, as a parameter, a variable or another class, is left out.
 */
export function findLocalClasses(body: readonly Node[]): Map<string, Class> {
  const counts = declarationCounts(body);
  const classes = new Map<string, Class>();
  const pending = [...body];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const found = classOf(node);
    if (found !== undefined && counts.get(found.name) === 1) {
      classes.set(found.name, found.cls);
    }
    pushChildNodes(pending, node);
  }
  return classes;
}

/**
 * The code of a class that runs only for an instance: the constructor, the methods and accessors
 * that are not static, and the values of the fields that are not static. A static member, a static
 * block, a computed key and the parent class run when the class is defined.
 */
export function instanceCode(cls: Class): Node[] {
  return cls.body.body.flatMap(member => {
    if (
      (member.type === 'MethodDefinition' || member.type === 'PropertyDefinition') &&
      !member.static &&
      member.value !== null
    ) {
      return [member.value];
    }
    return [];
  });
}
