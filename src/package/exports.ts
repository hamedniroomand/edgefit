import type { Finding } from '@/types.ts';

import type { ExportResult } from './result.ts';

/** The findings that only some exports reach, by export. Errors come first, then the names in order. */
export function resultsByExport(findings: readonly Finding[]): ExportResult[] {
  const byName = new Map<string, ExportResult>();
  for (const finding of findings) {
    for (const name of finding.exports ?? []) {
      const found = byName.get(name) ?? { name, level: finding.level, findings: [] };
      found.findings.push({
        api: finding.api,
        category: finding.category,
        level: finding.level,
        detail: finding.detail,
      });
      if (finding.level === 'error') {
        found.level = 'error';
      }
      byName.set(name, found);
    }
  }
  return [...byName.values()].toSorted(
    (a, b) =>
      Number(b.level === 'error') - Number(a.level === 'error') || a.name.localeCompare(b.name),
  );
}
