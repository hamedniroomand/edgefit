import { describe, expect, it } from 'vite-plus/test';

import { run } from '@/cli/run.ts';
import { captureIo, fixture } from '~/helpers.ts';

async function compare(argv: string[]): Promise<{ code: number; output: string }> {
  const io = captureIo(fixture('compare-app'));
  const code = await run(['compare', '--entry', 'src/index.ts', ...argv], io);
  return { code, output: io.output() };
}

describe('edgefit compare', () => {
  it('shows only APIs with a finding, across the default targets', async () => {
    const { code, output } = await compare([]);
    expect(code).toBe(1);
    expect(output).toContain('API            workerd  bun  deno\nnode:fs.watch  ✗        ✓    ✓\n');
    expect(output).not.toContain('deno-deploy');
    expect(output).not.toContain('node:fs.readFile');
    expect(output).toContain('1 error, 0 warnings');
  });

  it('includes supported APIs for the chosen targets with --all', async () => {
    const { output } = await compare(['workerd', 'bun', '--all']);
    expect(output).toContain('API               workerd  bun\n');
    expect(output).toContain('node:fs.readFile  ✓        ✓\n');
    expect(output).toContain('node:fs.watch     ✗        ✓\n');
  });

  it('lists the findings behind each row with --verbose', async () => {
    const { output } = await compare(['workerd', '--verbose']);
    expect(output).toContain('    reached by your code');
    expect(output).toContain('    error    unsupported  node:fs.watch  (workerd)');
  });

  it('prints versioned JSON', async () => {
    const { output } = await compare(['workerd', 'bun', '--format', 'json']);
    expect(JSON.parse(output)).toEqual({
      version: 2,
      targets: ['workerd', 'bun'],
      skipped: [],
      apis: [
        {
          api: 'node:fs.watch',
          packages: ['your code'],
          results: { workerd: 'unsupported', bun: 'supported' },
        },
      ],
    });
  });
});

describe('edgefit compare exit codes', () => {
  it('exits with 0 when no target has an error', async () => {
    const { code, output } = await compare(['bun', 'deno']);
    expect(code).toBe(0);
    expect(output).toContain('No known incompatible reachable APIs found.');
  });

  it.each([
    [['netlify'], 'Unknown target: netlify'],
    [['--format', 'github'], 'compare supports the text and json formats.'],
  ])('rejects %j', async (argv, message) => {
    const io = captureIo(fixture('compare-app'));
    expect(await run(['compare', ...argv], io)).toBe(2);
    expect(io.errors()).toContain(message);
  });
});
