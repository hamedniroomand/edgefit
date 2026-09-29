import path from 'node:path';

import type { LookupResult } from '@/data/dump.ts';
import { loadTargetData } from '@/targets/target-data.ts';
import type { Target } from '@/targets/target.ts';
import type { ApiRef, WorkerdOptions } from '@/types.ts';

import { assumedNotes, checkSettings, settingsNotes } from './settings.ts';
import type { AssumedSettings, DataSettings, WorkerdSettings } from './settings.ts';
import { findWranglerConfig, mainFrom, readWranglerConfig } from './wrangler.ts';
import type { WranglerConfig } from './wrangler.ts';

export const workerdConditions = ['workerd', 'worker', 'browser'];

function loadWrangler(
  root: string,
  option: WorkerdOptions['wranglerConfig'],
): WranglerConfig | undefined {
  if (option === false) {
    return undefined;
  }
  const file = option === undefined ? findWranglerConfig(root) : path.resolve(root, option);
  return file === undefined ? undefined : readWranglerConfig(file);
}

interface ResolvedSettings {
  settings: WorkerdSettings;
  assumed: AssumedSettings;
}

function resolveSettings(
  root: string,
  options: WorkerdOptions,
  wrangler: WranglerConfig | undefined,
  defaults: DataSettings,
): ResolvedSettings {
  const date = options.compatibilityDate ?? wrangler?.compatibilityDate;
  // A wrangler config without flags enables none; only a missing config falls back to the data.
  const flags =
    options.compatibilityFlags ??
    wrangler?.compatibilityFlags ??
    (wrangler === undefined ? undefined : []);
  let origin = 'the compatibility data defaults (no wrangler config found)';
  if (options.compatibilityDate !== undefined || options.compatibilityFlags !== undefined) {
    origin = 'the edgefit config';
  } else if (wrangler !== undefined) {
    origin = path.relative(root, wrangler.file);
  }
  return {
    settings: {
      compatibilityDate: date ?? defaults.compatibilityDate,
      compatibilityFlags: flags ?? defaults.compatibilityFlags,
      origin,
    },
    assumed: { date: date === undefined, flags: flags === undefined },
  };
}

function describeSettings(settings: WorkerdSettings): string {
  const flags =
    settings.compatibilityFlags.length > 0 ? settings.compatibilityFlags.join(', ') : 'none';
  return `compatibility_date ${settings.compatibilityDate}, flags: ${flags} (from ${settings.origin})`;
}

export function createWorkerdTarget(root: string, options: WorkerdOptions = {}): Target {
  const { index, matrixSource, description, globals } = loadTargetData('workerd');
  const dataSettings = matrixSource.settings?.workerd as DataSettings;
  const wrangler = loadWrangler(root, options.wranglerConfig);
  const { settings, assumed } = resolveSettings(root, options, wrangler, dataSettings);
  const wranglerFile = wrangler === undefined ? undefined : path.relative(root, wrangler.file);
  const lookup = (api: ApiRef): LookupResult => checkSettings(api, settings) ?? index.lookup(api);

  return {
    info: {
      key: 'workerd',
      platform: 'Cloudflare Workers',
      conditions: workerdConditions,
      data: description,
      settings: describeSettings(settings),
      notes: [
        ...assumedNotes(assumed, settings, wranglerFile),
        ...settingsNotes(settings, dataSettings),
      ],
    },
    resolvePlatform: 'browser',
    defaultEntry: wrangler === undefined ? undefined : mainFrom(root, wrangler),
    globals,
    lookup,
    hasProblemsBelow: api =>
      checkSettings(api, settings) !== undefined || index.hasProblemsBelow(api),
  };
}
