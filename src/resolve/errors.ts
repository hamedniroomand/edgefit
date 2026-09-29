import type { Message } from 'esbuild';

import { EdgefitError } from '@/errors.ts';

export class ResolveError extends EdgefitError {
  public constructor(message: string, hint?: string) {
    super(message, hint);
    this.name = 'ResolveError';
  }
}

const maxShownMessages = 5;

function formatMessage(message: Message): string {
  const { location } = message;
  const where =
    location === null ? '' : `${location.file}:${location.line}:${location.column + 1}: `;
  return `${where}${message.text}`;
}

function hintFor(messages: readonly Message[]): string | undefined {
  const text = messages.map(message => message.text).join('\n');
  if (/"(?:#imports|#internal\/|virtual:|#app)/u.test(text)) {
    return (
      'This looks like a framework virtual module, which only the framework can resolve. ' +
      'Build the project and scan its output instead, e.g. `edgefit check --built .output/server`.'
    );
  }
  if (text.includes('Could not resolve')) {
    return 'Install the project dependencies first, and check the entry and tsconfig paths.';
  }
  return undefined;
}

export function toResolveError(messages: readonly Message[]): ResolveError {
  const shown = messages.slice(0, maxShownMessages).map(message => formatMessage(message));
  if (messages.length > shown.length) {
    shown.push(`...and ${messages.length - shown.length} more`);
  }
  return new ResolveError(
    `Could not resolve the module graph:\n${shown.join('\n')}`,
    hintFor(messages),
  );
}
