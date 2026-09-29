import { builtinName } from '@/data/builtins.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { interopArgument, isRequire, moduleSpecifier, resolveBinding } from '@/extract/bindings.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { moduleRef } from '@/extract/refs.ts';
import { isTracked } from '@/extract/scope.ts';

import { visitOptionalCallee } from './guards.ts';

const computedModuleReason = 'the module name is computed at runtime';

function visitRequire(node: NodeOf<'CallExpression'>, context: VisitContext): void {
  const [argument] = node.arguments;
  if (argument === undefined) {
    return;
  }
  const specifier = moduleSpecifier(argument, context.scope);
  if (specifier === undefined) {
    context.collector.dynamic(undefined, 'require(<expression>)', computedModuleReason, node.start);
    context.visit(argument);
    return;
  }
  const module = builtinName(specifier);
  if (module !== undefined) {
    context.useRef(moduleRef(module), argument.start);
  }
}

export const visitCall: Visitor<NodeOf<'CallExpression'>> = (node, context) => {
  if (isRequire(node.callee, context.scope)) {
    visitRequire(node, context);
    return;
  }
  const argument = interopArgument(node);
  const binding = argument === undefined ? undefined : resolveBinding(argument, context);
  if (argument !== undefined && isTracked(binding)) {
    context.visitBound(argument);
    // The helper call stands for the module itself; its argument was recorded above.
    context.useRef(binding.ref, node.start, false);
    return;
  }
  if (!visitOptionalCallee(node, context)) {
    context.visitChildren(node);
  }
};

export const visitImportExpression: Visitor<NodeOf<'ImportExpression'>> = (node, context) => {
  const specifier = moduleSpecifier(node.source, context.scope);
  if (specifier === undefined) {
    context.collector.dynamic(undefined, 'import(<expression>)', computedModuleReason, node.start);
    context.visitChildren(node);
    return;
  }
  const module = builtinName(specifier);
  if (module !== undefined) {
    context.useRef(moduleRef(module), node.source.start);
  }
};
