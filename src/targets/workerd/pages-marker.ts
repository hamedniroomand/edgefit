import { readFileSync } from 'node:fs';
import path from 'node:path';

import { isAbsent } from './absent.ts';

/**
 * The presets of Nitro 2 and 3 that write no server code: the ones with `static: true` in the
 * preset list, with `_` written as `-`. A marker with any other preset names a server.
 */
const staticPresets = new Set([
  'cloudflare-pages-static',
  'static',
  'github-pages',
  'gitlab-pages',
  'netlify-static',
  'vercel-static',
  'zeabur-static',
  'zerops-static',
]);

/** What `nitro.json` of a Nitro build says. */
export type NitroMarker = {
  /** The marker, as a path from the project root. */
  file: string;
  /** The preset, with `_` written as `-`. */
  preset: string;
  /** When the build ran, or `undefined` when the marker has no date that parses. */
  built: Date | undefined;
};

export const isStaticPreset = (preset: string): boolean => staticPresets.has(preset);

/** The day of a build, as `2026-10-08`. */
export const dayOf = (built: Date): string => built.toISOString().slice(0, 10);

function parseMarker(text: string): { preset?: unknown; date?: unknown } | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? value : undefined;
  } catch {
    // Not JSON, so not a Nitro marker.
    return undefined;
  }
}

/**
 * The Nitro marker at `file`, or `undefined` when there is none: no file, a file that is not JSON,
 * or a file with no preset name. Any other error, such as `EACCES`, is thrown.
 */
export function readMarker(root: string, file: string): NitroMarker | undefined {
  let text: string;
  try {
    text = readFileSync(path.join(root, file), 'utf8');
  } catch (error) {
    if (isAbsent(error)) {
      return undefined;
    }
    throw error;
  }
  const { preset, date } = parseMarker(text) ?? {};
  if (typeof preset !== 'string') {
    return undefined;
  }
  const built = typeof date === 'string' ? new Date(date) : undefined;
  return {
    file: file.split(path.sep).join('/'),
    preset: preset.replaceAll('_', '-'),
    built: built === undefined || Number.isNaN(built.getTime()) ? undefined : built,
  };
}
