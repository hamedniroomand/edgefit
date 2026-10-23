type Row = { name: string; notes?: unknown; main?: string };
type Item = {
  name: string;
  result?: unknown;
  notes: boolean;
  problems?: string[];
  problem?: string;
};

export const marker: string;
export function escapeCommand(text: string): string;
export function resultOf(directory: string, name: string): { result: any } | { problem: string };
export function problemsOf(result: any, row: Omit<Row, 'name'> | undefined): string[];
export function markdownOf(items: readonly Item[]): string;
export function reportOf(
  names: readonly string[],
  directory: string,
  rows: readonly Row[],
): { markdown: string; problems: string[] };
