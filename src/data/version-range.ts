// No `@/` imports here: scripts/unreached/entries.mjs loads this file with plain node.

/** A release as `major.minor.patch`, the only form that a range of the data files holds. */
export const semver = /^\d+\.\d+\.\d+$/u;

/** The releases an entry was read in. A missing `max` has no upper end. */
export type VersionRange = { min: string; max?: string };

function parts(version: string): number[] {
  return version.split('.').map(Number);
}

/**
 * Compares `major.minor.patch` versions. A version with a pre-release suffix is not in a range
 * when it has the same major and minor as an end of the range. Otherwise only its major and
 * minor count.
 */
export function compareVersions(left: string, right: string): number {
  const [a, b] = [parts(left), parts(right)];
  for (const index of [0, 1, 2]) {
    const order = (a[index] ?? 0) - (b[index] ?? 0);
    if (order !== 0) {
      return order;
    }
  }
  return 0;
}

export function inRange(version: string, { min, max }: VersionRange): boolean {
  return (
    compareVersions(version, min) >= 0 && (max === undefined || compareVersions(version, max) <= 0)
  );
}
