# Use with a coding assistant

A coding assistant can run edgefit and act on the result. This page tells the assistant, and the person who sets it up, what to run and how to read the output.

## When to run edgefit

Run edgefit in these cases:

- Before you say that a change works on an edge runtime.
- After you add or update a dependency in a project that deploys to the edge.
- After you change the entry file, the build config or the deploy config.

Do not run it for a change that does not touch imports, dependencies or config.

## Which command to run

```sh
npx edgefit check --format json
```

The output is a [JSON report](/reference/json) with a fixed [schema](https://edgefit.kitdev.space/schema/report-v2.json). It has the same content as the text report. Use `--target <name>` to check one target.

To see what a change did, write a report before the change and one after it, then compare them:

```sh
npx edgefit check --format json > base.json
# make the change
npx edgefit check --format json > head.json
npx edgefit diff base.json head.json
```

## Exit codes

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| `0`  | No error-level findings.                                            |
| `1`  | Error-level findings. Read the report.                              |
| `2`  | Invalid arguments or config, or edgefit cannot resolve the project. |

A warning does not change the exit code. A result of `0` does not mean that the project is safe. It means edgefit found no error. See [limitations](/guide/limitations).

Exit code `1` also happens when edgefit crashes. Then stdout is empty and stderr has a stack trace. Parse the report only when stdout is not empty.

## Read a finding

Each finding has an `id`. The `id` is the same in every run for the same target, category, API and owner. Use it to follow one finding across runs. The same `id` can be in `findings` and in `guarded` when some uses of the API have a guard and some do not.

If a finding has a `suggestion`, it is a structured field. Its `kind` is `replace`, `setting` or `change`. For `replace`, `package` names the package to use. For `setting`, `setting` gives the key and the value. `source` links to the proof of the fix.

If a finding has no `suggestion`, edgefit does not know a fix. Do not guess one. Tell the user.

## Ignore a finding

Ignore a finding only when the user confirms that it is safe. Add a rule with a reason to the config file:

```ts
export default defineConfig({
  ignore: [
    { package: 'chokidar', api: 'node:fs.watch', reason: 'only imported by the dev server' },
  ],
});
```

Never ignore a finding to make the exit code `0`. See [ignoring findings](/guide/configuration#ignoring-findings).

## Instructions for your project

Copy this text into the instruction file of your project, such as `AGENTS.md` or `CLAUDE.md`:

```md
## Edge runtime checks

This project deploys to the edge. Use edgefit to check it.

- Run `npx edgefit check --format json` after you add or update a dependency, or change the entry file or the deploy config.
- Exit code `1` means error-level findings. Fix them or tell the user. Do not hide them.
- Use `suggestion` in a finding when it is present. If it is absent, do not guess a fix.
- Ignore a finding only when the user confirms it. Add the rule to the edgefit config with a `reason`.
- A result of `0` does not prove that the project is safe.
```
