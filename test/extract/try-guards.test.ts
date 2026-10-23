import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { fixture, usagesOf } from '~/helpers.ts';

const globals = new Set(['FileList', 'globalThis']);
const reads = (source: string): string[] => usagesOf(source, 'src/input.js', globals);
const guardClause = 'if (!globalThis.FileList) return false;';
const read = 'return globalThis.FileList.prototype;';
const fn = (body: string): string => `export function config() {\n${body}\n}`;
const afterTry = (tryStatement: string): string => fn(`${tryStatement}\n${read}`);

describe('a guard clause at the top level of a try block', () => {
  it.each([
    ['returns', 'catch (_) { return false; }'],
    ['throws', 'catch (error) { throw error; }'],
    ['throws after other code', 'catch (error) { log(error); throw error; }'],
  ])('guards the code after the try when the catch %s', (_name, handler) => {
    expect(reads(afterTry(`try { ${guardClause} } ${handler}`))).toContain(
      'api FileList.prototype [guarded]',
    );
  });

  it('guards the code after the try, also when other code follows the clause in the block', () => {
    const source = afterTry(`try { ${guardClause} check(); } catch (_) { return false; }`);
    expect(reads(source)).toContain('api FileList.prototype [guarded]');
  });

  it('guards the code after a try inside a try', () => {
    const inner = `try { ${guardClause} } catch (_) { return false; }`;
    const source = afterTry(`try { ${inner} } catch (_) { return false; }`);
    expect(reads(source)).toContain('api FileList.prototype [guarded]');
  });

  it('guards the code after the try in a loop, when the catch continues', () => {
    const source = `for (const name of names) {\n try { if (!globalThis.FileList) continue; } catch (_) { continue; }\n globalThis.FileList.of(name);\n}`;
    expect(reads(source)).toContain('api FileList.of [guarded]');
  });

  it('ends when the name that the check started from is written after the try', () => {
    const body = (write: string): string =>
      fn(
        `let scope = globalThis;\ntry { if (!scope.FileList) return false; } catch (_) { return false; }\n${write}\nreturn scope.FileList.prototype;`,
      );
    expect(reads(body(''))).toContain('api FileList.prototype [guarded]');
    expect(reads(body('scope = other;'))).toContain('api FileList.prototype');
    expect(reads(body('scope = other;'))).not.toContain('api FileList.prototype [guarded]');
  });
});

describe('a check of a computed key in a try block', () => {
  const keys = "const keys = ['log', 'warn'];\n";
  const members = (tryStatement: string): string[] =>
    usagesOf(
      `${keys}export function f(i) {\n var method = keys[i];\n ${tryStatement}\n console[method]();\n}`,
      'src/input.js',
      new Set(['console']),
    ).filter(usage => usage.startsWith('api console.'));

  it('guards the read after the try, the same as for a check outside a try', () => {
    const tryStatement = "try { if (!console[method]) method = 'trace'; } catch (_) { return; }";
    expect(members(tryStatement)).toEqual([
      'api console.log [guarded]',
      'api console.warn [guarded]',
      'api console.trace',
    ]);
  });

  it('guards nothing when the catch can complete', () => {
    const tryStatement = "try { if (!console[method]) method = 'trace'; } catch (_) {}";
    expect(members(tryStatement).every(usage => !usage.endsWith('[guarded]'))).toBe(true);
  });
});

describe('a guard clause in a try block that does not protect the code after it', () => {
  it.each([
    ['the catch can complete', 'try { CLAUSE } catch (_) {}'],
    ['the catch leaves only in a branch', 'try { CLAUSE } catch (_) { if (a) return false; }'],
    ['there is a finally', 'try { CLAUSE } catch (_) { return false; } finally { done(); }'],
    ['there is no catch', 'try { CLAUSE } finally { done(); }'],
    [
      'the clause is in a branch of the block',
      'try { if (a) { CLAUSE } } catch (_) { return false; }',
    ],
    ['the clause is in a nested block', 'try { { CLAUSE } } catch (_) { return false; }'],
    ['the clause is in a function', 'try { run(() => { CLAUSE }); } catch (_) { return false; }'],
  ])('is no guard when %s', (_name, tryStatement) => {
    const usages = reads(afterTry(tryStatement.replace('CLAUSE', guardClause)));
    expect(usages).toContain('api FileList.prototype');
    expect(usages).not.toContain('api FileList.prototype [guarded]');
  });

  it('is no guard for the code before the try', () => {
    const source = fn(`${read}\ntry { ${guardClause} } catch (_) { return false; }`);
    expect(reads(source)[0]).toBe('api FileList.prototype');
  });
});

describe('a guard clause in the catch block', () => {
  it('is not followed out of the try', () => {
    const source = afterTry(`try { run(); } catch (_) { ${guardClause} return false; }`);
    expect(reads(source)).not.toContain('api FileList.prototype [guarded]');
  });
});

describe('a check of a project that has a guard clause in a try block', () => {
  const run = async (entry: string): Promise<[string[], string[]]> => {
    const { reports } = await check({
      root: fixture('try-guard-app'),
      config: { targets: ['workerd'], entry, workerd: { wranglerConfig: false } },
    });
    return [
      (reports[0]?.findings ?? []).map(finding => finding.api),
      (reports[0]?.guarded ?? []).map(finding => finding.api),
    ];
  };

  it('guards the read after the try when the catch returns', async () => {
    expect(await run('guarded.mjs')).toEqual([[], ['FileList']]);
  });

  it('reports the read after the try when the catch can complete', async () => {
    expect(await run('fall-through.mjs')).toEqual([['FileList'], []]);
  });
});
