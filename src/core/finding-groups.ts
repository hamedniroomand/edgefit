import type { Finding } from '@/types.ts';

/**
 * Identifies a finding by its API and owner: the package name, or the file for the project's own
 * code. Versions and line numbers are left out, so a patch release keeps the same identity.
 * Build output has no file of the project, and its chunk names change with every build.
 */
export function findingKey(finding: Finding): string {
  const owner =
    finding.package?.name ??
    (finding.buildOutput === true ? 'build output' : finding.location.file);
  return `${finding.target}\0${finding.category}\0${finding.api}\0${owner}`;
}

/** A finding that one export reaches and another reaches in some other way counts for every export. */
function mergeExports(existing: Finding, other: Finding): void {
  if (existing.exports === undefined || other.exports === undefined) {
    delete existing.exports;
  } else {
    existing.exports = [...new Set([...existing.exports, ...other.exports])].toSorted();
  }
}

/** Merges findings for the same API within one owner: a package, a file of the project's own code, or build output. */
export function group(findings: readonly Finding[]): Finding[] {
  const groups = new Map<string, { finding: Finding; places: Set<string> }>();
  for (const finding of findings) {
    const key = findingKey(finding);
    const { file, line, column } = finding.location;
    const place = `${file}\0${line}\0${column}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { finding: { ...finding, otherLocations: [] }, places: new Set([place]) });
      continue;
    }
    // Several uses in the output can map to one place (line and column) in the source. That place
    // counts once.
    if (!existing.places.has(place)) {
      existing.places.add(place);
      existing.finding.otherLocations.push(finding.location);
    }
    mergeExports(existing.finding, finding);
  }
  return [...groups.values()].map(entry => entry.finding);
}
