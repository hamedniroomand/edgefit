import { parse } from 'jsonc-parser';
import type { ParseError } from 'jsonc-parser';

/** Parses a JSON-with-comments config file's text, naming the file on errors. */
export function parseJsonc(text: string, file: string): unknown {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(`Could not parse ${file}: invalid JSON at offset ${errors[0]?.offset ?? 0}`);
  }
  return value;
}
