/** One place a target looks for entries, such as wrangler's `main`. */
export type EntrySource = {
  /** Names the place in reports and in the error that lists what was searched. */
  label: string;
  /** A source that reads a convention, such as a file name, and not a declaration. */
  guessed: boolean;
  /** The files are build output: tracing is off for them, and findings are mapped through sourcemaps. */
  built?: boolean;
  /** Files relative to the root, or an empty list when the source has none. */
  find: () => string[];
  /** Notes for the report about the files found, such as that build output is out of date. */
  notes?: (files: string[]) => string[];
};

export type EntryMatch = {
  files: string[];
  /** The label of the source that found the files. */
  source: string;
  guessed: boolean;
  /** The files are build output. */
  built: boolean;
  notes: string[];
};

export type EntryDetection = {
  /** From a declaration: the first source that is not guessed and finds something. */
  exact: EntryMatch | undefined;
  /** From a convention: the first guessed source that finds something. */
  guess: EntryMatch | undefined;
  /** The label of every source, for the error shown when nothing is found. */
  searched: string[];
  /**
   * Whether the target takes the exact entries of another shared target when it has none, and
   * lends its own. A target whose entries only make sense on its platform is not shared.
   */
  shared: boolean;
  /** What to do next, for the error shown when nothing is found. The generic advice stays unless every target has its own. */
  advice?: () => string;
};

function firstMatch(sources: readonly EntrySource[], guessed: boolean): EntryMatch | undefined {
  for (const source of sources) {
    const files = source.guessed === guessed ? source.find() : [];
    if (files.length > 0) {
      return {
        files,
        source: source.label,
        guessed,
        built: source.built === true,
        notes: source.notes?.(files) ?? [],
      };
    }
  }
  return undefined;
}

export function detectEntries(sources: readonly EntrySource[], shared: boolean): EntryDetection {
  return {
    exact: firstMatch(sources, false),
    guess: firstMatch(sources, true),
    searched: sources.map(source => source.label),
    shared,
  };
}
