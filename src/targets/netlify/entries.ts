import { existsSync } from 'node:fs';
import path from 'node:path';

import { readNetlifyOutput } from '@/built/netlify-output.ts';
import type { NetlifyOutput } from '@/built/netlify-output.ts';
import { staleNote } from '@/built/stale.ts';
import { detectEntries } from '@/targets/entries.ts';
import type { EntryDetection, EntrySource } from '@/targets/entries.ts';

import type { NetlifyConfig } from './config.ts';
import { functionFile, listFunctions } from './functions.ts';
import { hasInlineRoute } from './inline-config.ts';

const defaultDirectory = 'netlify/edge-functions';
const outputDirectory = '.netlify';
const sourceLabel =
  '[[edge_functions]] in netlify.toml, and functions that export config with a path';

type EntryResult = {
  entries: EntryDetection;
  notes: string[];
};

type SourceFunctions = {
  /** The directory as shown in reports. */
  shown: string;
  exists: boolean;
  /** Every function in the directory. */
  listed: string[];
  /** Functions the project routes itself: declared in `netlify.toml`, or with an inline config. */
  own: string[];
  notes: string[];
};

const toEntries = (root: string, files: string[]): string[] =>
  files.map(file => path.relative(root, file)).toSorted();

function findSourceFunctions(root: string, config: NetlifyConfig | undefined): SourceFunctions {
  const directory = path.resolve(
    config === undefined ? root : path.dirname(config.file),
    config?.directory ?? defaultDirectory,
  );
  const shown = path.relative(root, directory);
  const exists = existsSync(directory);
  const declared = [...new Set(config?.functions ?? [])].map(name => ({
    name,
    file: functionFile(directory, name),
  }));
  const listed = exists ? listFunctions(directory) : [];
  const notes = declared.flatMap(({ name, file }) =>
    exists && file === undefined
      ? [`Function ${name} is declared in netlify.toml but not found in ${shown}.`]
      : [],
  );
  if (!exists) {
    notes.push(`No ${shown} directory found.`);
  } else if (listed.length === 0) {
    notes.push(`No edge function found in ${shown}.`);
  }
  const routed = [
    ...declared.flatMap(({ file }) => file ?? []),
    ...listed.filter(file => hasInlineRoute(file)),
  ];
  return { shown, exists, listed, own: toEntries(root, [...new Set(routed)]), notes };
}

/** The functions of the project and the ones a framework wrote, which both deploy. */
function routedSource(
  root: string,
  config: NetlifyConfig | undefined,
  { own }: SourceFunctions,
  output: NetlifyOutput,
): EntrySource {
  const hasOutput = output.files.length > 0;
  const configFile = config === undefined ? [] : [path.relative(root, config.file)];
  return {
    label: hasOutput ? `${sourceLabel}, and ${outputDirectory} (build output)` : sourceLabel,
    guessed: false,
    built: hasOutput,
    find: (): string[] => [...new Set([...own, ...output.files])].toSorted(),
    notes: (): string[] => [
      ...(hasOutput ? staleNote(root, output.files, [...own, ...configFile]) : []),
      ...output.unreadable.map(file => `${file} could not be read, so its functions were skipped.`),
    ],
  };
}

/** Netlify runs every function in the edge functions directory, so each one is an entry. */
export function findEntries(root: string, config: NetlifyConfig | undefined): EntryResult {
  const source = findSourceFunctions(root, config);
  const output = readNetlifyOutput(root, outputDirectory);
  const sources: EntrySource[] = [
    routedSource(root, config, source, output),
    {
      label: `the ${source.shown} directory${source.exists ? '' : ' (not found)'}`,
      guessed: false,
      find: (): string[] => toEntries(root, source.listed),
    },
  ];
  if (output.files.length === 0) {
    sources.push({
      label: `${outputDirectory}/v1/edge-functions or ${outputDirectory}/edge-functions/manifest.json (build output)`,
      guessed: false,
      find: (): string[] => [],
    });
  }
  return { entries: detectEntries(sources, false), notes: source.notes };
}
