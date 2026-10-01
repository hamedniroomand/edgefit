export interface SpecEntry {
  api: string;
  kind?: string;
  /** Only look the API up; never call it. */
  lookup?: boolean;
}
export interface Spec {
  apis: SpecEntry[];
  mocked: string[];
}
export function buildSpec(
  runtime: string,
  options?: { discover?: boolean; mocked?: boolean; drift?: boolean; presence?: boolean },
): Spec;
