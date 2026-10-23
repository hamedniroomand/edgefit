/**
 * Whether the error says that a file, or a folder on its path, is not there. Any other error,
 * such as `EACCES`, says something else and must reach the user.
 */
export function isAbsent(error: unknown): boolean {
  const { code } = error as NodeJS.ErrnoException;
  return code === 'ENOENT' || code === 'ENOTDIR';
}
