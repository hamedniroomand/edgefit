export const semver = /(\d+)\.(\d+)\.(\d+)/u;

/** Negative when `a` is older than `b`. Versions that are not `x.y.z` compare as equal. */
export function compareVersions(a: string, b: string): number {
  const left = semver.exec(a);
  const right = semver.exec(b);
  if (left === null || right === null) {
    return 0;
  }
  for (let part = 1; part <= 3; part += 1) {
    const difference = Number(left[part]) - Number(right[part]);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/** A note when the runtime checked for is older than the one the data describes. */
export function versionNotes(runtime: string, version: string, dataVersion: string): string[] {
  return compareVersions(version, dataVersion) < 0
    ? [
        `${runtime} ${version} is older than the data (${dataVersion}); ` +
          `APIs added to ${runtime} since then are reported as supported.`,
      ]
    : [];
}
