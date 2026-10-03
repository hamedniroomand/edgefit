import { createHash } from 'node:crypto';

import { findingKey } from '@/core/findings.ts';
import type { Finding } from '@/types.ts';

/** A short ID for a finding. It uses the identity of `findingKey`, so it stays the same between runs. */
export function findingId(finding: Finding): string {
  return `ef_${createHash('sha256').update(findingKey(finding)).digest('hex').slice(0, 10)}`;
}
