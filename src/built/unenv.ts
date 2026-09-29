import { builtinName, displayApi } from '@/data/builtins.ts';
import type { Usage } from '@/types.ts';

// unenv 2 publishes its runtime under `dist/`, unenv 1 at the package root.
const unenvRuntime = /(?:^|\/)unenv\/(?:dist\/)?runtime\/(mock|node)\/(.+)\.[cm]?js$/u;

/** The built-in an unenv file stands in for: `internal/fs/promises` is `fs/promises`, `fs/_fs` is `fs`. */
function polyfilledModule(file: string): string | undefined {
  const segments = file
    .split('/')
    .filter(segment => segment !== 'internal' && segment !== 'index' && !segment.startsWith('_'));
  for (let length = segments.length; length > 0; length -= 1) {
    const name = builtinName(segments.slice(0, length).join('/'));
    if (name !== undefined) {
      return name;
    }
  }
  return undefined;
}

/**
 * A mocked usage for an unenv polyfill or mock that the build bundled in place of the real API,
 * located in the unenv file itself as evidence. `file` is a path with forward slashes.
 */
export function unenvUsage(file: string): Usage | undefined {
  const [, kind, name = ''] = unenvRuntime.exec(file) ?? [];
  const location = { file, line: 1, column: 1 };
  if (kind === 'mock') {
    return {
      kind: 'mocked',
      api: undefined,
      display: `unenv/mock/${name}`,
      reason: 'is an unenv mock the build injected in place of a real module',
      location,
    };
  }
  const module = kind === 'node' ? polyfilledModule(name) : undefined;
  if (module === undefined) {
    return undefined;
  }
  return {
    kind: 'mocked',
    api: { module, path: [] },
    display: displayApi(module, []),
    reason:
      'is replaced by an unenv polyfill in the build, where missing members throw or do nothing',
    location,
  };
}
