export function durationsOf(results: unknown): Map<string, number>;
export function readDurations(directory?: string): Map<string, number>;
export function knownOf<TEntry extends { name: string }>(
  entries: readonly TEntry[],
  durations: ReadonlyMap<string, number>,
): TEntry[];
export function median(values: readonly number[]): number;
export function dealShards(
  entries: readonly { name: string }[],
  durations: ReadonlyMap<string, number>,
  count: number,
): number[];
