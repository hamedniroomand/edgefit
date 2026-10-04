import { parseJSONC } from 'confbox';

/** Parses a JSON-with-comments config file's text, naming the file on errors. */
export function parseJsonc(text: string, file: string): unknown {
  try {
    return parseJSONC(text, { allowTrailingComma: true });
  } catch (error) {
    throw new Error(`Could not parse ${file}: ${(error as Error).message}`, { cause: error });
  }
}
