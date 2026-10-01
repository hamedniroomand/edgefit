import { readJsonc } from '@/targets/deno/deno-config.ts';
import type { EntrySource } from '@/targets/entries.ts';
import {
  existingFile,
  entryFromCommand,
  fallbackSources,
  guessedSource,
} from '@/targets/entry-sources.ts';

function files(root: string, candidates: unknown[]): string[] {
  return candidates.flatMap(candidate =>
    typeof candidate === 'string' ? (existingFile(root, candidate) ?? []) : [],
  );
}

function taskSource(root: string, configFile: string | undefined, name: string): EntrySource {
  return guessedSource(root, {
    label: `deno.json tasks.${name}`,
    find: () => {
      const tasks = configFile === undefined ? undefined : readJsonc(configFile).tasks;
      const task = (tasks as Record<string, unknown> | undefined)?.[name];
      const command =
        typeof task === 'object' && task !== null ? (task as { command?: unknown }).command : task;
      const file =
        typeof command === 'string' ? entryFromCommand(root, command, 'deno') : undefined;
      return file === undefined ? [] : [file];
    },
  });
}

/** `configFile` is the deno config found for the project, if any. */
export function denoEntrySources(root: string, configFile: string | undefined): EntrySource[] {
  return [
    {
      label: 'deno.json "exports"',
      guessed: false,
      find: () => {
        const exports = configFile === undefined ? undefined : readJsonc(configFile).exports;
        if (typeof exports === 'object' && exports !== null) {
          return files(root, Object.values(exports));
        }
        return files(root, [exports]);
      },
    },
    taskSource(root, configFile, 'start'),
    taskSource(root, configFile, 'dev'),
    guessedSource(root, {
      label: 'main.ts',
      find: () => [existingFile(root, 'main.ts')].flatMap(file => file ?? []),
    }),
    ...fallbackSources(root),
  ];
}
