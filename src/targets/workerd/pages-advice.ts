import { lstatSync, readdirSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import { readPackageJson } from '@/targets/entry-sources.ts';

import { isAbsent } from './absent.ts';
import { dayOf, isStaticPreset, readMarker } from './pages-marker.ts';
import type { NitroMarker } from './pages-marker.ts';

const frameworks = [
  'nuxt',
  'nitro',
  'nitropack',
  'next',
  '@sveltejs/kit',
  'astro',
  'react-router',
  '@remix-run/dev',
  '@solidjs/start',
  '@builder.io/qwik-city',
];

const checkAgain = 'Then run `edgefit check` again.';

function exists(file: string): boolean {
  try {
    lstatSync(file);
    return true;
  } catch (error) {
    if (isAbsent(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Whether the folder holds a file, at any depth, other than a dotfile or `nitro.json`. A folder
 * with only `.gitkeep`, `.DS_Store` or the marker has no site yet, and a build may still add a
 * worker. A missing folder holds none. The walk stops at the first file.
 */
function holdsFiles(folder: string): boolean {
  const pending = [folder];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (error) {
      if (isAbsent(error)) {
        return false;
      }
      throw error;
    }
    if (
      entries.some(
        entry => entry.isFile() && !entry.name.startsWith('.') && entry.name !== 'nitro.json',
      )
    ) {
      return true;
    }
    pending.push(
      ...entries.filter(entry => entry.isDirectory()).map(entry => path.join(current, entry.name)),
    );
  }
  return false;
}

/**
 * The note for a Pages output folder that holds static files only, or `undefined` when it may
 * hold a server: it has a worker or a `functions/` folder, it holds no file, or a Nitro marker in
 * it names a preset that is not static. With no marker, the folder holds static files.
 */
export function staticNote(root: string, directory: string): string | undefined {
  const folder = path.resolve(root, directory);
  if (exists(path.join(folder, '_worker.js')) || exists(path.join(root, 'functions'))) {
    return undefined;
  }
  if (!holdsFiles(folder)) {
    return undefined;
  }
  // Only the marker in the Pages output folder counts. Pages deploys this folder and nothing else,
  // so a build in `.output`, whatever its preset, does not change what Pages serves.
  const marker = readMarker(root, path.join(directory, 'nitro.json'));
  if (marker !== undefined && !isStaticPreset(marker.preset)) {
    return undefined;
  }
  return `Pages serves ${directory} as static files, so there is no server code to check on workerd.`;
}

function frameworkOf(root: string): string | undefined {
  const manifest = readPackageJson(root);
  const dependencies = {
    ...(manifest?.dependencies as object | undefined),
    ...(manifest?.devDependencies as object | undefined),
  };
  return frameworks.find(name => name in dependencies);
}

const names = (marker: NitroMarker): string =>
  `${marker.file} names the preset ${marker.preset}${marker.built === undefined ? '' : ` and the build date ${dayOf(marker.built)} UTC`}`;

/** Whether the build of `other` is later than the build of `marker`, and used another preset. */
function isNewer(other: NitroMarker | undefined, marker: NitroMarker): other is NitroMarker {
  return (
    other?.built !== undefined &&
    marker.built !== undefined &&
    other.preset !== marker.preset &&
    other.built > marker.built
  );
}

/** What a Nitro marker with a server preset says about a Pages output folder that has no worker. */
function markerAdvice(
  directory: string,
  marker: NitroMarker,
  output: NitroMarker | undefined,
): string {
  const newer = isNewer(output, marker)
    ? [
        `The Nitro marker ${names(output)}.`,
        `That build is newer, and it wrote its files in .output, not in ${directory}.`,
      ]
    : [];
  if (marker.preset !== 'cloudflare-pages') {
    return [
      `The Nitro marker ${names(marker)}.`,
      'That preset does not write a Pages worker.',
      ...newer,
      `Build with NITRO_PRESET=cloudflare_pages. ${checkAgain}`,
    ].join(' ');
  }
  return [
    `The Nitro marker ${names(marker)}.`,
    `The Pages output folder ${directory} has no worker.`,
    ...newer,
    'A static build with this preset writes no worker, so for static files only, build with NITRO_PRESET=cloudflare-pages-static.',
    `For a server, build the project for Cloudflare Pages. ${checkAgain}`,
  ].join(' ');
}

/** What to do when a Pages project has no entry and its output is not a static site. */
export function adviceFor(root: string, directory: string): string {
  const marker = readMarker(root, path.join(directory, 'nitro.json'));
  const output = readMarker(root, path.join('.output', 'nitro.json'));
  const named = marker ?? output;
  if (named !== undefined && !isStaticPreset(named.preset)) {
    return markerAdvice(directory, named, marker === undefined ? undefined : output);
  }
  if (!holdsFiles(path.resolve(root, directory))) {
    const framework = frameworkOf(root);
    const folder = `The Pages output folder ${directory} does not exist or has no files.`;
    const next = `or check \`pages_build_output_dir\` in your wrangler config. ${checkAgain}`;
    return framework === undefined
      ? `${folder} Build the project, ${next}`
      : `This project uses \`${framework}\`. ${folder} Build the project for Cloudflare Pages, ${next}`;
  }
  return `edgefit found no server code in ${directory}/_worker.js or in functions/. A _worker.js folder needs an index.js file. The functions/ folder needs a .js, .mjs, .ts, .tsx or .jsx file that is not a .d.ts file.`;
}
