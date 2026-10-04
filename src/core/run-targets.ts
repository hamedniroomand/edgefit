import { attributeOutput } from '@/built/attribute.ts';
import { EdgefitError } from '@/errors.ts';
import type { TargetKey } from '@/types.ts';

import { readStoredModules } from './findings.ts';
import type { ModuleUsages } from './findings.ts';
import { leaveOutSupplied } from './scan.ts';
import type { SuppliedLoad } from './scan.ts';

/** A target that could not be checked, such as one whose module graph does not resolve. */
export interface FailedTarget {
  key: TargetKey;
  message: string;
  hint?: string;
  /** The error that stopped the target. */
  error: EdgefitError;
}

/**
 * The modules to check, the notes of the scan, and the loads of a name that the user gives, with
 * the stored modules read. Build output holds the callers of its own functions, so no name in it
 * comes from a user.
 */
export function shownModules(
  scanned: ModuleUsages[],
  root: string,
  isBuilt: boolean,
): { modules: ModuleUsages[]; notes: string[]; supplied: SuppliedLoad[] } {
  const shown = isBuilt
    ? { ...attributeOutput(scanned, root), supplied: [] }
    : { ...leaveOutSupplied(scanned), notes: [] };
  return { ...shown, modules: readStoredModules(shown.modules) };
}

/**
 * Waits for every target. A target that fails with an `EdgefitError` is kept as failed, so the
 * others still have a report. When no target has a report, the first error is thrown. Any other
 * error is a bug and is thrown too.
 */
export async function settleTargets<TReport>(
  pending: readonly { key: TargetKey; report: Promise<TReport> }[],
): Promise<{ reports: TReport[]; failed: FailedTarget[] }> {
  const promises: Promise<TReport>[] = [];
  for (const { report } of pending) {
    promises.push(report);
  }
  const settled = await Promise.allSettled(promises);
  const reports: TReport[] = [];
  const failed: FailedTarget[] = [];
  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === 'fulfilled') {
      reports.push(outcome.value);
    } else if (outcome.reason instanceof EdgefitError) {
      const { message, hint } = outcome.reason;
      failed.push({
        key: pending[index]?.key ?? 'workerd',
        message,
        ...(hint === undefined ? {} : { hint }),
        error: outcome.reason,
      });
    } else {
      throw outcome.reason;
    }
  }
  if (reports.length === 0 && failed[0] !== undefined) {
    throw failed[0].error;
  }
  return { reports, failed };
}
