import { createHash } from 'node:crypto';

import { findingKey } from '@/core/findings.ts';
import type { Finding } from '@/types.ts';

/**
 * A short ID for a finding. It uses the identity of `findingKey`, so it stays the same between runs.
 * Build output has no owner, and its chunk names change with every build, so it has no file in the ID.
 */
export function findingId(finding: Finding): string {
  const owned =
    finding.buildOutput === true && finding.package === undefined
      ? { ...finding, location: { ...finding.location, file: 'build output' } }
      : finding;
  return `ef_${createHash('sha256').update(findingKey(owned)).digest('hex').slice(0, 10)}`;
}
