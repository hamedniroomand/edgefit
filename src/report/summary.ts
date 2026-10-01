import { countLevels } from '@/core/check.ts';
import type { CheckResult, SkippedTarget } from '@/core/check.ts';
import { formatPackage } from '@/resolve/packages.ts';
import type { Finding, Location, PackageInfo } from '@/types.ts';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Why a target was left out, and where it looked for an entry. */
export function skippedMessage({ searched }: SkippedTarget): string {
  return searched.length > 0
    ? `No entry found. Searched: ${searched.join(', ')}`
    : 'No entry found.';
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

// pnpm keeps each package at node_modules/.pnpm/<name>@<version>/node_modules/<name>, often
// above the project. The text report shows the path a person would recognize instead.
const pnpmStorePath = /^(?:.*?\/)?node_modules\/\.pnpm\/[^/]+\/node_modules\//u;

export function formatLocation(location: Location): string {
  const file = location.file.replace(pnpmStorePath, 'node_modules/');
  return `${file}:${location.line}:${location.column}`;
}

export function ownerName(owned: { package: PackageInfo | undefined }): string {
  return owned.package === undefined ? 'your code' : formatPackage(owned.package);
}

export function chainLine(finding: Finding): string {
  return finding.chain.join(' > ');
}

/** What to do about a finding, as one sentence, or nothing when edgefit has no fix for it. */
export function fixLine(finding: Finding): string | undefined {
  return finding.suggestion === undefined ? undefined : `fix: ${finding.suggestion.text}`;
}

/** The link behind the fix, unless the finding already shows the same one. */
export function fixSourceLine(finding: Finding): string | undefined {
  const source = finding.suggestion?.source;
  return source === undefined || source === finding.source ? undefined : `why ${source}`;
}
