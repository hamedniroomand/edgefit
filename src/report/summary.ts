import { countLevels } from '@/core/check.ts';
import type { CheckResult } from '@/core/check.ts';
import { formatPackage } from '@/resolve/packages.ts';
import type { Finding, Location, PackageInfo } from '@/types.ts';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function summaryLine(result: CheckResult): string {
  const { errors, warnings } = countLevels(result);
  const ignored = result.reports.reduce((total, report) => total + report.ignored, 0);
  const parts = [plural(errors, 'error'), plural(warnings, 'warning')];
  if (ignored > 0) {
    parts.push(`${ignored} ignored`);
  }
  return parts.join(', ');
}

export function formatLocation(location: Location): string {
  return `${location.file}:${location.line}:${location.column}`;
}

export function ownerName(owned: { package: PackageInfo | undefined }): string {
  return owned.package === undefined ? 'your code' : formatPackage(owned.package);
}

export function chainLine(finding: Finding): string {
  return finding.chain.join(' > ');
}
