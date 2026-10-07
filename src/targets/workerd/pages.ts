import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { staleNote } from '@/built/stale.ts';
import type { EntrySource } from '@/targets/entries.ts';
import { existingFile, readPackageJson } from '@/targets/entry-sources.ts';
import { globFiles } from '@/targets/glob-files.ts';

import { pathFrom } from './wrangler.ts';
import type { WranglerConfig } from './wrangler.ts';

/**
 * The extensions that Pages reads in `functions/`: `generateConfigFromFileTree` in
 * @cloudflare/pages-functions, which wrangler uses. A type file has no handler.
 */
const functionExtension = /(?<!\.d)\.(?:mjs|js|ts|tsx|jsx)$/u;

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

type Pages = {
  sources: EntrySource[];
  /** What to do when the sources find nothing. */
  advice: () => string;
};

function nitroPreset(root: string, directory: string): string | undefined {
  for (const file of [path.join(directory, 'nitro.json'), path.join('.output', 'nitro.json')]) {
    try {
      const { preset } = JSON.parse(readFileSync(path.join(root, file), 'utf8')) as {
        preset?: unknown;
      };
      if (typeof preset === 'string') {
        return preset;
      }
    } catch {
      // No file, or a file that is not a Nitro marker: look at the next place.
    }
  }
  return undefined;
}

function frameworkOf(root: string): string | undefined {
  const manifest = readPackageJson(root);
  const dependencies = {
    ...(manifest?.dependencies as object | undefined),
    ...(manifest?.devDependencies as object | undefined),
  };
  return frameworks.find(name => name in dependencies);
}

function adviceFor(root: string, directory: string): string {
  const preset = nitroPreset(root, directory)?.replaceAll('_', '-');
  if (preset !== undefined && preset !== 'cloudflare-pages') {
    return `The Nitro build used the preset ${preset}, which does not write a Pages worker. Build with NITRO_PRESET=cloudflare_pages, then run \`edgefit check\` again.`;
  }
  const framework = frameworkOf(root);
  if (framework !== undefined) {
    return `This project uses ${framework}, and ${directory} has no _worker.js. Build the project for Cloudflare Pages first, then run \`edgefit check\` again.`;
  }
  return `There is no server code to check. Pages serves ${directory} as static files, and the project has no functions/ folder.`;
}

/**
 * Where a Pages project keeps the code that runs: `_worker.js` in the build output (advanced
 * mode), else the `functions/` folder, which Pages ignores when `_worker.js` exists.
 */
export function pagesSources(root: string, wrangler: WranglerConfig): Pages | undefined {
  if (wrangler.pagesBuildOutputDir === undefined || wrangler.main !== undefined) {
    return undefined;
  }
  const directory = pathFrom(root, wrangler, wrangler.pagesBuildOutputDir);
  const configFile = path.relative(root, wrangler.file);
  const label = `${configFile} "pages_build_output_dir"`;
  return {
    sources: [
      {
        label: `${label}: ${directory}/_worker.js`,
        guessed: false,
        built: true,
        find: () =>
          [path.join(directory, '_worker.js'), path.join(directory, '_worker.js', 'index.js')]
            .map(file => existingFile(root, file))
            .filter(file => file !== undefined)
            .slice(0, 1),
        notes: files => staleNote(root, files, []),
      },
      {
        label: 'the functions/ folder',
        guessed: false,
        find: () =>
          existsSync(path.join(root, 'functions'))
            ? globFiles(root, 'functions/**/*')
                .filter(file => functionExtension.test(file))
                .toSorted()
            : [],
      },
    ],
    advice: () => adviceFor(root, directory),
  };
}
