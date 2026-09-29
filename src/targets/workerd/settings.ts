import type { LookupResult } from '@/data/dump.ts';
import type { ApiRef } from '@/types.ts';

import { flagsSource, gatedFlags, gatesFor, hasNodeCompat, isGateOpen } from './gates.ts';

export interface WorkerdSettings {
  compatibilityDate: string;
  compatibilityFlags: string[];
  /** Where the settings came from, for the report. */
  origin: string;
}

/** The settings the compatibility data was generated with. */
export type DataSettings = Omit<WorkerdSettings, 'origin'>;

const nodeCompatV2Date = '2024-09-23';

const absentModules = new Set(['sea', 'test', 'test/reporters']);

const nodeCompatGlobals = new Set(['Buffer', 'global']);

function unsupported(note: string, source?: string): LookupResult {
  return source === undefined
    ? { status: 'unsupported', note }
    : { status: 'unsupported', note, source };
}

function checkGlobal(api: ApiRef, settings: WorkerdSettings): LookupResult | undefined {
  const [name] = api.path;
  if (name !== undefined && nodeCompatGlobals.has(name) && !hasNodeCompat(settings)) {
    return unsupported('is only defined with the nodejs_compat compatibility flag', flagsSource);
  }
  return undefined;
}

/**
 * Applies the project's compatibility flags and date. Returns a result when they decide
 * the outcome on their own, before the compatibility data is consulted.
 */
export function checkSettings(api: ApiRef, settings: WorkerdSettings): LookupResult | undefined {
  if (api.module === '*globals*') {
    return checkGlobal(api, settings);
  }
  if (absentModules.has(api.module)) {
    return unsupported('is not provided by workerd');
  }
  if (!hasNodeCompat(settings)) {
    const alsOnly =
      api.module === 'async_hooks' && settings.compatibilityFlags.includes('nodejs_als');
    return alsOnly
      ? undefined
      : unsupported('needs the nodejs_compat compatibility flag, which is not set', flagsSource);
  }
  const gate = gatesFor(api).find(candidate => !isGateOpen(candidate, settings));
  if (gate === undefined) {
    return undefined;
  }
  // Without native support, wrangler's nodejs_compat build substitutes unenv polyfills.
  return {
    status: 'mocked',
    note:
      `is not native at compatibility date ${settings.compatibilityDate}, so wrangler substitutes ` +
      `an unenv polyfill that may no-op or throw; set compatibility_date to ${gate.date} or later, ` +
      `or add the ${gate.flag} flag`,
    source: flagsSource,
  };
}

/** How the project's settings differ from those the compatibility data was generated with. */
export function settingsNotes(settings: WorkerdSettings, dataSettings: DataSettings): string[] {
  const notes: string[] = [];
  const { compatibilityDate: date, compatibilityFlags: flags } = settings;
  if (!hasNodeCompat(settings)) {
    notes.push(
      'nodejs_compat is not enabled, so Node built-ins are unavailable. Add it to compatibility_flags or use a compatibility_date of 2026-08-04 or later.',
    );
  } else if (date < nodeCompatV2Date && !flags.includes('nodejs_compat_v2')) {
    notes.push(
      `compatibility_date ${date} predates ${nodeCompatV2Date}, so nodejs_compat runs in its older v1 mode. ` +
        'The compatibility data describes v2; expect more gaps than reported.',
    );
  }
  if (date > dataSettings.compatibilityDate) {
    notes.push(
      `compatibility_date ${date} is newer than the data (${dataSettings.compatibilityDate}); ` +
        'runtime changes since then are not reflected.',
    );
  }
  const unknownFlags = flags.filter(
    flag =>
      /node|process/u.test(flag) &&
      !dataSettings.compatibilityFlags.includes(flag) &&
      !gatedFlags.has(flag),
  );
  if (unknownFlags.length > 0) {
    notes.push(
      `The data was generated without ${unknownFlags.join(', ')}; results for affected APIs may be inaccurate.`,
    );
  }
  return notes;
}
