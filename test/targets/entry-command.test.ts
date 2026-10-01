import { describe, expect, it } from 'vite-plus/test';

import { entryFromCommand } from '@/targets/entry-sources.ts';
import { fixture } from '~/helpers.ts';

const root = fixture('entry-detection/commands');
const bun = (command: string): string | undefined => entryFromCommand(root, command, 'bun');
const deno = (command: string): string | undefined => entryFromCommand(root, command, 'deno');

describe('the file in a start command', () => {
  it('reads `bun run <file>`, with flags and a bare `bun <file>`', () => {
    expect(bun('bun run src/index.ts')).toBe('src/index.ts');
    expect(bun('bun run --hot src/index.ts')).toBe('src/index.ts');
    expect(bun('bun server.ts')).toBe('server.ts');
    expect(bun('bun --watch ./server.ts')).toBe('server.ts');
  });

  it('reads `deno run` and `deno serve`', () => {
    expect(deno('deno serve -A server.ts')).toBe('server.ts');
    expect(deno('deno serve --port 8000 server.ts')).toBe('server.ts');
    expect(deno('deno run --allow-net server.ts')).toBe('server.ts');
  });

  it('skips KEY=value prefixes', () => {
    expect(bun('PORT=3000 NODE_ENV=production bun run src/index.ts')).toBe('src/index.ts');
  });

  it('finds nothing for a script name that is not a file', () => {
    expect(bun('bun run dev')).toBeUndefined();
    expect(deno('deno task dev')).toBeUndefined();
  });

  it('finds nothing for another runner, a missing file or a later command', () => {
    expect(bun('node src/index.ts')).toBeUndefined();
    expect(bun('bun run src/missing.ts')).toBeUndefined();
    expect(bun('bun run build && bun run src/index.ts')).toBeUndefined();
    expect(bun('bun run ../outside.ts')).toBeUndefined();
  });
});
