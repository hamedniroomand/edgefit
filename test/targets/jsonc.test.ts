import { describe, expect, it } from 'vite-plus/test';

import { parseJsonc } from '@/targets/jsonc.ts';

describe('parsing JSONC', () => {
  it('accepts comments and trailing commas', () => {
    const text =
      '{\n  // main entry\n  "main": "src/index.ts", /* inline */\n  "flags": ["a",],\n}';
    expect(parseJsonc(text, 'wrangler.jsonc')).toEqual({ main: 'src/index.ts', flags: ['a'] });
  });

  it('names the file and the JSON parse error', () => {
    let reason = '';
    try {
      JSON.parse('{ "main": }');
    } catch (error) {
      reason = (error as Error).message;
    }
    expect(() => parseJsonc('{ "main": }', 'wrangler.jsonc')).toThrow(
      `Could not parse wrangler.jsonc: ${reason}`,
    );
  });
});
