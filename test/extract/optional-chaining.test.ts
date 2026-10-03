import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const v8 = "import v8 from 'node:v8';\n";

describe('optional chaining as a check', () => {
  it('does not use a member that is only read with `?.`', () => {
    expect(usagesOf(`${v8}const on = v8.startupSnapshot?.isBuildingSnapshot;`)).toEqual([
      'api node:v8',
    ]);
  });

  it('records no member for `a?.b?.()` alone', () => {
    expect(usagesOf(`${v8}v8.startupSnapshot?.isBuildingSnapshot?.();`)).toEqual(['api node:v8']);
  });

  it('guards the branch of an if that tests `a?.b`', () => {
    expect(
      usagesOf(
        `${v8}if (v8.startupSnapshot?.isBuildingSnapshot) {\n  v8.startupSnapshot.add();\n}`,
      ),
    ).toEqual(['api node:v8', 'api node:v8.startupSnapshot.add [guarded]']);
  });

  it('guards the branch of an if that tests `a?.b?.()`', () => {
    expect(
      usagesOf(
        `${v8}if (v8.startupSnapshot?.isBuildingSnapshot?.()) {\n  v8.startupSnapshot.add();\n}`,
      ),
    ).toEqual(['api node:v8', 'api node:v8.startupSnapshot.add [guarded]']);
  });

  it('does not guard the else branch', () => {
    expect(
      usagesOf(
        `${v8}if (v8.startupSnapshot?.isBuildingSnapshot) {\n  noop();\n} else {\n  v8.startupSnapshot.add();\n}`,
      ),
    ).toEqual(['api node:v8', 'api node:v8.startupSnapshot.add']);
  });

  it('still uses a member that `?.` leads to, and a member that is called', () => {
    expect(usagesOf(`${v8}v8.startupSnapshot?.isBuildingSnapshot.run();`)).toEqual([
      'api node:v8',
      'api node:v8.startupSnapshot.isBuildingSnapshot.run',
    ]);
    expect(usagesOf(`${v8}v8.startupSnapshot?.isBuildingSnapshot();`)).toEqual([
      'api node:v8',
      'api node:v8.startupSnapshot.isBuildingSnapshot',
    ]);
  });
});
