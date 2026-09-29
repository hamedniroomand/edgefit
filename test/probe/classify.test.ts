import { classifyThrown, isDenied } from '@scripts/probe/classify.mjs';
import { describe, expect, it } from 'vite-plus/test';

const coded = (code: string, message = 'boom'): Error =>
  Object.assign(new Error(message), { code });

describe('classifyThrown', () => {
  it.each(['ERR_NOT_IMPLEMENTED', 'ERR_METHOD_NOT_IMPLEMENTED', 'ERR_UNSUPPORTED_OPERATION'])(
    'reports %s as unsupported',
    code => {
      expect(classifyThrown(coded(code))).toBe('unsupported');
    },
  );

  it.each(['Not implemented', 'not yet implemented', 'this is not supported'])(
    'reports the message "%s" as unsupported',
    message => {
      expect(classifyThrown(new Error(message))).toBe('unsupported');
    },
  );

  it.each(['ERR_INVALID_ARG_TYPE', 'ERR_MISSING_ARGS', 'ERR_INVALID_ARG_VALUE'])(
    'reports %s as implemented',
    code => {
      expect(classifyThrown(coded(code))).toBe('implemented');
    },
  );

  it('reports any other throw as inconclusive', () => {
    expect(classifyThrown(new Error('ENOENT'))).toBe('inconclusive');
    expect(classifyThrown('not an error')).toBe('inconclusive');
  });
});

describe('isDenied', () => {
  it.each([
    'process.exit',
    'process.abort',
    'process.kill',
    'child_process.spawn',
    'cluster.fork',
    'fs.writeFileSync',
    'fs.promises.rm',
    'fs/promises.writeFile',
    'inspector.waitForDebugger',
    'inspector/promises.waitForDebugger',
  ])('denies %s', api => {
    expect(isDenied(api)).toBe(true);
  });

  it.each([
    'fs.readFile',
    'fs.promises.watch',
    'process.cwd',
    'process.report.writeReport',
    'inspector.url',
  ])('allows %s', api => {
    expect(isDenied(api)).toBe(false);
  });
});
