import path from 'node:path';

import type { LookupResult } from '@/data/dump.ts';
import { loadTargetData } from '@/targets/target-data.ts';
import type { Target } from '@/targets/target.ts';
import type { ApiRef, WorkerdOptions } from '@/types.ts';

import { checkSettings, settingsNotes } from './settings.ts';
import type { DataSettings, WorkerdSettings } from './settings.ts';
import { findWranglerConfig, readWranglerConfig } from './wrangler.ts';
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

function resolveSettings(
  root: string,
  options: WorkerdOptions,
  wrangler: WranglerConfig | undefined,
  defaults: DataSettings,
): WorkerdSettings {
  const compatibilityDate =
    options.compatibilityDate ?? wrangler?.compatibilityDate ?? defaults.compatibilityDate;
  const compatibilityFlags =
    options.compatibilityFlags ?? wrangler?.compatibilityFlags ?? defaults.compatibilityFlags;
  let origin = 'the compatibility data defaults (no wrangler config found)';
  if (options.compatibilityDate !== undefined || options.compatibilityFlags !== undefined) {
    origin = 'the edgefit config';
  } else if (wrangler !== undefined) {
    origin = path.relative(root, wrangler.file);
  }
  return { compatibilityDate, compatibilityFlags, origin };
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
  const settings = resolveSettings(root, options, wrangler, dataSettings);
  const lookup = (api: ApiRef): LookupResult => checkSettings(api, settings) ?? index.lookup(api);

  return {
    info: {
      key: 'workerd',
      platform: 'Cloudflare Workers',
      conditions: workerdConditions,
      data: description,
      settings: describeSettings(settings),
      notes: settingsNotes(settings, dataSettings),
    },
    resolvePlatform: 'browser',
    defaultEntry: wrangler?.main,
    globals,
    lookup,
    hasProblemsBelow: api =>
      checkSettings(api, settings) !== undefined || index.hasProblemsBelow(api),
  };
}
