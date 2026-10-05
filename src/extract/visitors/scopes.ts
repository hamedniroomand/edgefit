import type { NodeOf } from '@/extract/ast.ts';
import type { Visitor } from '@/extract/context.ts';
import { collectBlockNames, collectLexicalNames, patternNames } from '@/extract/declarations.ts';
import { bindCallbackKeys, bindLoopKeys, collectKnown } from '@/extract/key-bindings.ts';
import { factoryModule } from '@/extract/main-only.ts';
import { createScope, declare } from '@/extract/scope.ts';

import { visitStatements } from './guards.ts';
import { visitParentClass } from './inheritance.ts';

type FunctionNode = NodeOf<
  'FunctionDeclaration' | 'FunctionExpression' | 'ArrowFunctionExpression'
>;

export const visitProgram: Visitor<NodeOf<'Program'>> = (node, context) => {
  declare(context.scope, collectBlockNames(node.body));
  collectKnown(node.body, context.scope, []);
  visitStatements(node.body, context);
};

export const visitFunction: Visitor<FunctionNode> = (node, context) => {
  const scope = createScope(context.scope);
  const params = node.params.flatMap(param => patternNames(param));
  const names = [...params];
  if (node.type === 'FunctionExpression' && node.id !== null) {
    names.push(node.id.name);
  }
  const { body } = node;
  if (body?.type === 'BlockStatement') {
    names.push(...collectBlockNames(body.body));
  }
  declare(scope, names);
  bindCallbackKeys(node, context.parent(), scope, context.scope);
  const module = factoryModule(node, context.parent(), context.functions);
  if (module !== undefined) {
    scope.modules.add(module);
  }
  // A function may be called after the `try` block around it has ended.
  context.collector.guards.deferred(() => {
    context.inScope(scope, () => {
      for (const param of node.params) {
        context.visitPattern(param);
      }
      if (body?.type === 'BlockStatement') {
        // The body shares the function's scope instead of opening a block scope.
        collectKnown(body.body, scope, params);
        context.withAncestor(body, () => {
          visitStatements(body.body, context);
        });
      } else {
        context.visit(body);
      }
    });
  });
};

export const visitClass: Visitor<NodeOf<'ClassDeclaration' | 'ClassExpression'>> = (
  node,
  context,
) => {
  context.visitAll(node.decorators);
  if (node.superClass !== null) {
    visitParentClass(node.superClass, context);
  }
  // Field initializers run when an instance is made, not where the class is written.
  context.collector.guards.deferred(() => {
    context.visit(node.body);
  });
};

export const visitBlock: Visitor<NodeOf<'BlockStatement' | 'StaticBlock'>> = (node, context) => {
  const scope = createScope(context.scope);
  declare(scope, collectLexicalNames(node.body));
  collectKnown(node.body, scope);
  context.inScope(scope, () => {
    visitStatements(node.body, context);
  });
};

export const visitSwitch: Visitor<NodeOf<'SwitchStatement'>> = (node, context) => {
  context.visit(node.discriminant);
  const scope = createScope(context.scope);
  declare(
    scope,
    node.cases.flatMap(switchCase => collectLexicalNames(switchCase.consequent)),
  );
  collectKnown(
    node.cases.flatMap(switchCase => switchCase.consequent),
    scope,
  );
  context.inScope(scope, () => {
    context.visitAll(node.cases);
  });
};

export const visitFor: Visitor<NodeOf<'ForStatement' | 'ForInStatement' | 'ForOfStatement'>> = (
  node,
  context,
) => {
  const scope = createScope(context.scope);
  const head = node.type === 'ForStatement' ? node.init : node.left;
  if (head?.type === 'VariableDeclaration' && head.kind !== 'var') {
    declare(
      scope,
      head.declarations.flatMap(declarator => patternNames(declarator.id)),
    );
  }
  if (node.type === 'ForOfStatement') {
    bindLoopKeys(node, scope);
  }
  context.inScope(scope, () => {
    context.visitChildren(node);
  });
};

export const visitCatch: Visitor<NodeOf<'CatchClause'>> = (node, context) => {
  const scope = createScope(context.scope);
  declare(scope, patternNames(node.param));
  context.inScope(scope, () => {
    context.visitPattern(node.param);
    context.visit(node.body);
  });
};
