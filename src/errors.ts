/** An error caused by the user's input or project, reported without a stack trace (exit code 2). */
export class EdgefitError extends Error {
  public readonly hint: string | undefined;

  public constructor(message: string, hint?: string) {
    super(message);
    this.name = 'EdgefitError';
    this.hint = hint;
  }
}
