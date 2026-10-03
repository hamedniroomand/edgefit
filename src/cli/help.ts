import { failOnValues } from '@/report/diff.ts';
import { reportFormats } from '@/report/index.ts';
import { compareTargetKeys, targetKeys } from '@/targets/index.ts';

export const helpText = `Usage: edgefit <command> [options]

Check whether a project and its dependencies will run on edge and alternative JS runtimes.

Commands:
  check     Scan a project from its entry point
  compare   Show the reached APIs side by side across targets
  package   Check a package from the registry or a local directory
  diff      Show what changed between two \`check --format json\` reports
  targets   List supported targets and the data behind each
  help      Show this help

Run edgefit --version (or -v) to print the installed version.

Options for check:
  --target <name>    Target runtime (repeatable): ${targetKeys.join(', ')}. Default: workerd
  --entry <file>     Entry point or glob (repeatable). Default: config \`entry\`, then each
                     target's own, such as wrangler \`main\`
  --built <path>     Scan build output instead: its entry file or directory, e.g.
                     .output/server. Sourcemaps map findings to the original files
  --root <dir>       Project root. Default: the current directory
  --config <file>    Config file. Default: edgefit.config.{ts,mts,js,mjs} in the root
  --format <format>  Output format: ${reportFormats.join(', ')}. Default: text
  --verbose          List guarded findings and every unknown warning in full
  --no-color         Disable colored output

Usage for compare: edgefit compare [target...] [options]
  [target...]        Targets to compare. Default: ${compareTargetKeys.join(', ')}
  --all              Include APIs that every target supports
  --verbose          List the packages and findings behind each row
  --format <format>  Output format: text, json. Default: text
  --entry, --root, --config and --no-color work as for check

Usage for diff: edgefit diff <base.json> <head.json> [options]
  --fail-on <when>   Exit with 1 on: ${failOnValues.join(', ')}. Default: new-errors
  --format <format>  Output format: ${reportFormats.join(', ')}. Default: text
                     github annotates only the new findings
  --no-color         Disable colored output

Usage for package: edgefit package <name[@version]|dir|file.tgz> [options]
  Installs the package into a temporary project without running its scripts, then checks each
  public entry point with every export used.
  --target <name>    Target runtime (repeatable). Default: ${compareTargetKeys.join(', ')}
  --export <subpath> Check only this \`exports\` subpath, e.g. ./client (repeatable)
  --skip <subpath>   Leave out this subpath (repeatable)
  --main <subpath>   The subpath that decides the result, for a package without a . entry
  --badge <file>     Also write a badge SVG
  --registry <url>   npm registry to install from
  --keep             Keep the temporary project for debugging
  --format <format>  Output format: text, json. Default: text
  --no-color         Disable colored output

Exit codes: 0 no errors, 1 findings at error level, 2 invalid input or project.
`;
