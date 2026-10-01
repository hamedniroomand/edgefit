import type { LookupResult } from '@/data/dump.ts';
import type { ApiRef } from '@/types.ts';

import {
  flagsSource,
  gatedFlags,
  gatesFor,
  hasNodeCompat,
  isGateOpen,
  nodeCompatDefaultDate,
} from './gates.ts';
import type { Gate } from './gates.ts';

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

/** What to do so `nodejs_compat` is on, given how it came to be off. */
function nodeCompatSuggestion(settings: WorkerdSettings): NonNullable<LookupResult['suggestion']> {
  const off = settings.compatibilityFlags.includes('no_nodejs_compat');
  if (off && settings.compatibilityDate >= nodeCompatDefaultDate) {
    // From this date it is on unless that flag turns it off, so taking the flag out is enough.
    return {
      kind: 'setting',
      text: 'Remove `no_nodejs_compat` from `compatibility_flags`.',
      setting: { name: 'compatibility_flags', value: 'no_nodejs_compat', remove: true },
      source: flagsSource,
    };
  }
  return {
    kind: 'setting',
    text: off
      ? 'Replace `no_nodejs_compat` with `nodejs_compat` in `compatibility_flags`.'
      : 'Add `nodejs_compat` to `compatibility_flags`.',
    setting: { name: 'compatibility_flags', value: 'nodejs_compat' },
    source: flagsSource,
  };
}

/** An API a missing flag leaves undefined: code that checks for it first never reaches it. */
function withoutFlag(note: string, settings: WorkerdSettings): LookupResult {
  return {
    ...unsupported(note, flagsSource),
    absent: true,
    suggestion: nodeCompatSuggestion(settings),
  };
}

/**
 * What opens a closed gate. Setting both an `enable_` and a `disable_` flag makes workerd refuse
 * to start, so a `disable_` flag is taken out, and swapped for the `enable_` flag when the
 * compatibility date alone would not open the gate.
 */
function gateSuggestion(
  gate: Gate,
  settings: WorkerdSettings,
): NonNullable<LookupResult['suggestion']> {
  const disable = gate.flag.replace(/^enable_/u, 'disable_');
  if (!settings.compatibilityFlags.includes(disable)) {
    return {
      kind: 'setting',
      text: `Set \`compatibility_date\` to ${gate.date} or later, or add the \`${gate.flag}\` flag.`,
      setting: { name: 'compatibility_date', value: gate.date },
      source: flagsSource,
    };
  }
  if (settings.compatibilityDate >= gate.date) {
    return {
      kind: 'setting',
      text: `Remove the \`${disable}\` flag from \`compatibility_flags\`.`,
      setting: { name: 'compatibility_flags', value: disable, remove: true },
      source: flagsSource,
    };
  }
  return {
    kind: 'setting',
    text: `Replace \`${disable}\` with \`${gate.flag}\` in \`compatibility_flags\`.`,
    setting: { name: 'compatibility_flags', value: gate.flag },
    source: flagsSource,
  };
}

function checkGlobal(api: ApiRef, settings: WorkerdSettings): LookupResult | undefined {
  const [name] = api.path;
  if (name !== undefined && nodeCompatGlobals.has(name) && !hasNodeCompat(settings)) {
    return withoutFlag('is only defined with the nodejs_compat compatibility flag', settings);
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
      : withoutFlag('needs the nodejs_compat compatibility flag, which is not set', settings);
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
      'an unenv polyfill that may no-op or throw',
    source: flagsSource,
    suggestion: gateSuggestion(gate, settings),
  };
}

/** Which settings had no value of their own, so the compatibility data's were used. */
export interface AssumedSettings {
  date: boolean;
  flags: boolean;
}

/** Tells the user which settings were guessed, and how to give the real ones. */
export function assumedNotes(
  assumed: AssumedSettings,
  settings: WorkerdSettings,
  wranglerFile: string | undefined,
): string[] {
  if (wranglerFile === undefined) {
    const parts = [
      ...(assumed.date ? [`compatibility_date ${settings.compatibilityDate}`] : []),
      ...(assumed.flags ? [`the flags ${settings.compatibilityFlags.join(', ') || 'none'}`] : []),
    ];
    const verb = assumed.date && !assumed.flags ? 'is' : 'are';
    return parts.length === 0
      ? []
      : [
          `No wrangler config was found, so ${parts.join(' and ')} ${verb} assumed. ` +
            'Set `workerd.compatibilityDate` and `workerd.compatibilityFlags` in the edgefit config, ' +
            'or point `workerd.wranglerConfig` at your wrangler config.',
        ];
  }
  return assumed.date
    ? [`${wranglerFile} has no compatibility_date, so ${settings.compatibilityDate} is assumed.`]
    : [];
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
