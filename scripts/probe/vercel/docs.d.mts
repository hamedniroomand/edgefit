export interface ParsedDocs {
  lastUpdated: string | undefined;
  globals: string[];
  /** Module name to a hash of its description. */
  modules: Record<string, string>;
  blocked: string[];
}
export interface DriftSection {
  title: string;
  items: string[];
}
export function section(markdown: string, heading: string): string[];
export function normalize(text: string): string;
export function hash(text: string): string;
export function parseEdgeDocs(markdown: string): ParsedDocs;
export function compareDocs(
  parsed: ParsedDocs,
  allowlist: {
    globals: string[];
    modules: Record<string, unknown>;
    docs: { moduleDescriptions: Record<string, string> };
  },
  overrides: { apis: Record<string, unknown>; notModelled: string[] },
): DriftSection[];
