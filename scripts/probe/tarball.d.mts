export function readPackageFiles(
  name: string,
  files: string[],
): Promise<{ version: string; texts: Record<string, string> }>;
export function readPackageFile(
  name: string,
  file: string,
): Promise<{ version: string; text: string }>;
