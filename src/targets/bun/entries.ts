import type { EntrySource } from '@/targets/entries.ts';
import {
  fallbackSources,
  guessedSource,
  existingFile,
  packageFieldSource,
  scriptSource,
} from '@/targets/entry-sources.ts';

/** Bun runs `module` or a start script directly, and `index.ts` is what `bun init` writes. */
export function bunEntrySources(root: string): EntrySource[] {
  return [
    packageFieldSource(root, ['module']),
    scriptSource(root, 'start', 'bun'),
    scriptSource(root, 'dev', 'bun'),
    guessedSource(root, {
      label: 'index.ts',
      find: () => [existingFile(root, 'index.ts')].flatMap(file => file ?? []),
    }),
    ...fallbackSources(root),
  ];
}
