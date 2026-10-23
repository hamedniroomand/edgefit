import type { Node } from 'oxc-parser';

import type { NodeOf } from '@/extract/ast.ts';
import type { Visitor } from '@/extract/context.ts';

import { visitCall, visitImportExpression, visitNew } from './calls.ts';
import { visitDeclaration, visitDeclarator } from './declarators.ts';
import { visitConditional, visitIf, visitLogical, visitTry } from './guards.ts';
import {
  visitExportAll,
  visitExportDefault,
  visitExportNamed,
  visitImport,
  visitImportEquals,
} from './modules.ts';
import {
  skip,
  visitAssignment,
  visitClassMember,
  visitEnum,
  visitEnumMember,
  visitIdentifier,
  visitLabeled,
  visitMember,
  visitProperty,
  visitUpdate,
} from './references.ts';
import {
  visitBlock,
  visitCatch,
  visitClass,
  visitFor,
  visitFunction,
  visitProgram,
  visitSwitch,
} from './scopes.ts';
import { visitSignalHandler } from './signals.ts';

/** A call that sets or takes away a signal handler is visited as one, and any other call as a call. */
const visitCallExpression: Visitor<NodeOf<'CallExpression'>> = (node, context) => {
  if (!visitSignalHandler(node, context)) {
    visitCall(node, context);
  }
};

type VisitorMap = { [Type in Node['type']]?: Visitor<Extract<Node, { type: Type }>> };

const visitors: VisitorMap = {
  Program: visitProgram,
  FunctionDeclaration: visitFunction,
  FunctionExpression: visitFunction,
  ArrowFunctionExpression: visitFunction,
  ClassDeclaration: visitClass,
  ClassExpression: visitClass,
  BlockStatement: visitBlock,
  StaticBlock: visitBlock,
  SwitchStatement: visitSwitch,
  ForStatement: visitFor,
  ForInStatement: visitFor,
  ForOfStatement: visitFor,
  CatchClause: visitCatch,
  ImportDeclaration: visitImport,
  ExportNamedDeclaration: visitExportNamed,
  ExportAllDeclaration: visitExportAll,
  ExportDefaultDeclaration: visitExportDefault,
  TSImportEqualsDeclaration: visitImportEquals,
  IfStatement: visitIf,
  TryStatement: visitTry,
  ConditionalExpression: visitConditional,
  LogicalExpression: visitLogical,
  CallExpression: visitCallExpression,
  NewExpression: visitNew,
  ImportExpression: visitImportExpression,
  VariableDeclaration: visitDeclaration,
  VariableDeclarator: visitDeclarator,
  Identifier: visitIdentifier,
  MemberExpression: visitMember,
  Property: visitProperty,
  MethodDefinition: visitClassMember,
  PropertyDefinition: visitClassMember,
  AccessorProperty: visitClassMember,
  AssignmentExpression: visitAssignment,
  UpdateExpression: visitUpdate,
  TSEnumDeclaration: visitEnum,
  TSEnumMember: visitEnumMember,
  LabeledStatement: visitLabeled,
  BreakStatement: skip,
  ContinueStatement: skip,
  MetaProperty: skip,
};

export function visitorFor(node: Node): Visitor | undefined {
  return visitors[node.type] as Visitor | undefined;
}
