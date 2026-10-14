import { extractUsages } from '@/extract/index.ts';

export const tls = "const tls = require('node:tls');\n";

/** The keys that the first `node:tls` call passes, with `=value` for a literal value. */
export function keysOf(source: string, file = 'src/input.js'): string[] {
  const call = extractUsages(file, source, {
    globals: new Set(),
    nodeEnv: 'production',
  }).find(usage => usage.display.startsWith('node:tls.') && usage.passedKeys !== undefined);
  return (call?.passedKeys ?? []).map(({ key, value }) =>
    value === undefined ? key : `${key}=${String(value)}`,
  );
}

export const connect = (options: string): string => `${tls}tls.connect({ ${options} });`;
