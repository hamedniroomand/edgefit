import type { NodeOf } from '@/extract/ast.ts';
import type { Visitor } from '@/extract/context.ts';
import { collectBlockNames, collectLexicalNames, patternNames } from '@/extract/declarations.ts';
import { createScope, declare } from '@/extract/scope.ts';

type FunctionNode = NodeOf<
  'FunctionDeclaration' | 'FunctionExpression' | 'ArrowFunctionExpression'
>;

export const visitProgram: Visitor<NodeOf<'Program'>> = (node, context) => {
  declare(context.scope, collectBlockNames(node.body));
  context.visitAll(node.body);
};

export const visitFunction: Visitor<FunctionNode> = (node, context) => {
  const scope = createScope(context.scope);
  const names = node.params.flatMap(param => patternNames(param));
  if (node.type === 'FunctionExpression' && node.id !== null) {
    names.push(node.id.name);
  }
  const { body } = node;
  if (body?.type === 'BlockStatement') {
    names.push(...collectBlockNames(body.body));
  }
  declare(scope, names);
  context.inScope(scope, () => {
    for (const param of node.params) {
      context.visitPattern(param);
    }
    if (body?.type === 'BlockStatement') {
      // The body shares the function's scope instead of opening a block scope.
      context.withAncestor(body, () => {
        context.visitAll(body.body);
      });
    } else {
      context.visit(body);
    }
  });
};

export const visitClass: Visitor<NodeOf<'ClassDeclaration' | 'ClassExpression'>> = (
  node,
  context,
) => {
  context.visitAll(node.decorators);
  context.visitAll([node.superClass, node.body]);
};

export const visitBlock: Visitor<NodeOf<'BlockStatement' | 'StaticBlock'>> = (node, context) => {
  const scope = createScope(context.scope);
  declare(scope, collectLexicalNames(node.body));
  context.inScope(scope, () => {
    context.visitAll(node.body);
  });
};

export const visitSwitch: Visitor<NodeOf<'SwitchStatement'>> = (node, context) => {
  context.visit(node.discriminant);
  const scope = createScope(context.scope);
  declare(
    scope,
    node.cases.flatMap(switchCase => collectLexicalNames(switchCase.consequent)),
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
