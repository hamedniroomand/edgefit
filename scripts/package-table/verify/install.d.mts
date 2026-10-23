/** Runs `npm install` with `args` in `directory`. Returns the error text, or `undefined` on success. */
export type NpmInstall = (directory: string, args?: string[]) => string | undefined;

export type Installed =
  | {
      directory: string;
      /** The peers that the package marks optional and that are not installed. */
      optionalPeers: string[];
      /** A line for each peer that a note names and that did not install, such as `react: <error>`. */
      peerFailures: string[];
    }
  | { error: string };

export function install(
  work: string,
  file: string,
  name: string,
  version: string,
  /** The notes of the main entry on the runtime. A note names one optional peer, or no peer. */
  notes?: readonly string[],
  run?: NpmInstall,
): Installed;
