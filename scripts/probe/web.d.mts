export function webMissingApis(runtime: string, data?: { api: unknown }): string[];
export function domMissingApis(
  runtime: string,
  dom?: { names: string[]; presentOn: Record<string, string[]> },
  web?: { api: Record<string, unknown> },
): string[];
