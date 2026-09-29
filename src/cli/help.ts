import { failOnValues } from '@/report/diff.ts';
import { reportFormats } from '@/report/index.ts';
import { compareTargetKeys, targetKeys } from '@/targets/index.ts';

export const helpText = `Usage: edgefit <command> [options]

Check whether a project and its dependencies will run on edge and alternative JS runtimes.

Commands:
  check     Scan a project from its entry point
  compare   Show the reached APIs side by side across targets
  diff      Show what changed between two \`check --format json\` reports
  targets   List supported targets and the data behind each
  help      Show this help

Run edgefit --version (or -v) to print the installed version.

Options for check:
  --target <name>    Target runtime (repeatable): ${targetKeys.join(', ')}. Default: workerd
  --entry <file>     Entry point. Default: config \`entry\`, then wrangler \`main\`
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

Exit codes: 0 no errors, 1 findings at error level, 2 invalid input or project.
`;
