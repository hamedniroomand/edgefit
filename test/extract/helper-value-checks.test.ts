import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const names = new Set(['globalThis', 'Deno', 'EdgeRuntime']);
/** Whether each read of `Deno.version` is guarded. Runtime tags such as `[deno]` are left out. */
const deno = (source: string): string[] =>
  usagesOf(source, 'src/input.ts', names)
    .filter(usage => usage.includes('Deno.version'))
    .map(usage =>
      usage.includes('[guarded]') ? 'api Deno.version [guarded]' : 'api Deno.version',
    );

const detect = `function detectPlatform() {
  if (typeof globalThis.Deno !== 'undefined') return 'deno';
  if (typeof globalThis.EdgeRuntime !== 'undefined') return 'edge';
  return 'unknown';
}`;

describe('a helper that returns a string behind a check', () => {
  it('guards a comparison of its call with that string', () => {
    const source = `${detect}\nexport const v = () => (detectPlatform() === 'deno' ? globalThis.Deno.version : '');`;
    expect(deno(source)).toEqual(['api Deno.version [guarded]']);
  });

  it('guards a comparison through a const that holds the call, as in openai', () => {
    const source = `${detect}
export function properties() {
  const detectedPlatform = detectPlatform();
  if (detectedPlatform === 'deno') {
    return globalThis.Deno.version;
  }
  return '';
}`;
    expect(deno(source)).toEqual(['api Deno.version [guarded]']);
  });

  it('guards the else branch of !==, and the string on the left', () => {
    const source = `${detect}\nexport const v = () => ('deno' !== detectPlatform() ? '' : globalThis.Deno.version);`;
    expect(deno(source)).toEqual(['api Deno.version [guarded]']);
  });
});

describe('a helper result that holds no check', () => {
  it('guards nothing for another string, or the branch where the value differs', () => {
    const other = `${detect}\nexport const v = () => (detectPlatform() === 'edge' ? globalThis.Deno.version : '');`;
    const differs = `${detect}\nexport const v = () => (detectPlatform() !== 'deno' ? globalThis.Deno.version : '');`;
    expect(deno(other)).toEqual(['api Deno.version']);
    expect(deno(differs)).toEqual(['api Deno.version']);
  });

  it('guards nothing when two returns give the string', () => {
    const twice = `function detectPlatform() {
  if (typeof globalThis.Deno !== 'undefined') return 'deno';
  if (flag) return 'deno';
  return 'unknown';
}\nexport const v = () => (detectPlatform() === 'deno' ? globalThis.Deno.version : '');`;
    expect(deno(twice)).toEqual(['api Deno.version']);
  });

  it('guards nothing when the last return gives the string', () => {
    const last = `function detectPlatform() {
  if (typeof globalThis.EdgeRuntime !== 'undefined') return 'edge';
  return 'deno';
}\nexport const v = () => (detectPlatform() === 'deno' ? globalThis.Deno.version : '');`;
    expect(deno(last)).toEqual(['api Deno.version']);
  });

  it('does not count the call itself as a check', () => {
    const source = `${detect}\nexport const v = () => (detectPlatform() ? globalThis.Deno.version : '');`;
    expect(deno(source)).toEqual(['api Deno.version']);
  });
});

describe('a static method of a local class that returns a check', () => {
  const monitor = `class Monitor {
  static isAvailable() {
    return typeof globalThis.Deno !== 'undefined';
  }
}`;

  it('guards like a plain helper', () => {
    const source = `${monitor}\nexport const v = () => (Monitor.isAvailable() ? globalThis.Deno.version : '');`;
    expect(deno(source)).toEqual(['api Deno.version [guarded]']);
  });

  it('guards nothing when the file sets the method again', () => {
    const source = `${monitor}\nMonitor.isAvailable = () => true;\nexport const v = () => (Monitor.isAvailable() ? globalThis.Deno.version : '');`;
    expect(deno(source)).toEqual(['api Deno.version']);
  });

  it('guards nothing for a method that is not static', () => {
    const source = `class Monitor {
  isAvailable() {
    return typeof globalThis.Deno !== 'undefined';
  }
}\nexport const v = (m) => (m.isAvailable() ? globalThis.Deno.version : '');`;
    expect(deno(source)).toEqual(['api Deno.version']);
  });
});
