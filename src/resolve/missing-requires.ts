import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Message } from 'esbuild';
import type { Node } from 'oxc-parser';

import { childNodes, isFunction, staticString, strip } from '@/extract/ast.ts';
import { parse } from '@/extract/index.ts';

import { importKey, moduleName } from './optional-peers.ts';

function bareSpecifier(specifier: string): boolean {
  return specifier.length > 0 && !/^[./\\#]|:/u.test(specifier);
}

function installed(importer: string, specifier: string): boolean {
  const name = moduleName(specifier);
  return (createRequire(importer).resolve.paths(name) ?? []).some(directory =>
    existsSync(path.join(directory, name)),
  );
}

/** A top-level load of the same module must still stop the check. */
export function lazyRequires(file: string, source: string): Map<string, number[]> {
  const result = parse(file, source);
  const loads = new Map<string, number[]>();
  const blocked = new Set<string>();
  if (result.errors.length > 0) {
    return loads;
  }
  const visit = (node: Node, lazy: boolean): void => {
    const callee = node.type === 'CallExpression' ? strip(node.callee) : undefined;
    const required = callee?.type === 'Identifier' && callee.name === 'require';
    const argument = required && node.type === 'CallExpression' ? node.arguments[0] : undefined;
    const imported =
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration' ||
      node.type === 'ImportExpression'
        ? node.source
        : undefined;
    const specifier = staticString(argument ?? imported);
    if (specifier !== undefined && bareSpecifier(specifier)) {
      if (required && lazy) {
        loads.set(specifier, [...(loads.get(specifier) ?? []), node.start]);
      } else {
        blocked.add(specifier);
      }
    }
    for (const child of childNodes(node)) {
      visit(child, lazy || isFunction(node));
    }
  };
  visit(result.program as Node, false);
  for (const specifier of blocked) {
    loads.delete(specifier);
  }
  return loads;
}

export function acceptMissingRequires(
  root: string,
  messages: readonly Message[],
  accepted: Set<string>,
): boolean {
  const files = new Map<string, Map<string, number[]>>();
  let added = false;
  for (const { location, text } of messages) {
    const specifier = /^Could not resolve "([^"]+)"/u.exec(text)?.[1];
    if (specifier === undefined || location === null) {
      continue;
    }
    const importer = path.resolve(root, location.file);
    let loads = files.get(importer);
    if (loads === undefined) {
      loads = lazyRequires(importer, readFileSync(importer, 'utf8'));
      files.set(importer, loads);
    }
    const key = importKey(importer, specifier);
    if (loads.has(specifier) && !accepted.has(key) && !installed(importer, specifier)) {
      accepted.add(key);
      added = true;
    }
  }
  return added;
}
