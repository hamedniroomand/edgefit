# What is edgefit?

edgefit checks whether a JavaScript or TypeScript project, including everything it imports from `node_modules`, will run on an edge or alternative runtime such as Cloudflare Workers, Bun, Deno, Netlify Edge Functions or Vercel Edge.

## The problem

Runtimes like workerd, Bun and Deno implement a large part of the Node API, but not all of it. Some modules are missing. Some functions exist but throw when called. Some accept calls and quietly do nothing. You usually find out in production, and usually because of a package three levels down that you never imported yourself.

Type checking does not catch this, because `@types/node` describes Node. Bundling does not catch it either: wrangler, for example, swaps missing Node modules for polyfills that build fine and then fail at runtime.

## What edgefit does

edgefit starts at your entry point and walks the module graph the way the target's bundler would. For every module it reaches, it parses the code, collects each Node built-in and Web API the code uses, and looks each one up in compatibility data for the target runtime.

The result is a list of findings. Each one tells you:

- **what** is used, such as `node:fs.watch` or `navigator.locks.request`
- **why** it is a problem, in one line
- **where** it is: the package and version, the file, line and column
- **how** it is reached: the import chain from your entry point
- **who says so**: a link to the runtime source the result was read from, when there is one

```
error    unsupported  node:fs.watch  (workerd)
       file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION
       chokidar@4.0.1  node_modules/chokidar/index.js:5:13
       via src/index.ts > src/dev/reload.ts > chokidar
```

That chain is often the most useful part. Here it shows that a dev-only reload helper pulls `chokidar` into the production bundle.

## Principles

**Resolution fidelity over rule count.** edgefit resolves packages with the target's export conditions (`workerd`, `worker` and `browser` for Workers, `bun` and `node` for Bun, and so on). A package that ships a separate Workers build is judged on that build. A false error costs more trust than a missed warning.

**It never claims your code is safe.** A clean run prints "No known incompatible reachable APIs found", and it means exactly that. Anything edgefit cannot analyze statically, such as `require(someVariable)`, becomes an `unknown` finding.

**Results are reproducible.** All compatibility data is vendored and pinned. Two runs on the same project with the same edgefit version give the same result.

**Results are traceable.** Every data source is listed with its version, commit and license. Run `edgefit targets` to see them.

## What it is not

- It does not run your code. It is a static analysis, so it cannot tell whether a branch is taken at runtime. See [Limitations](/guide/limitations).
- It is not a bundler or a polyfill. It tells you what breaks; fixing it is up to you, usually by swapping a dependency or moving code behind a boundary.
- It does not check your runtime's own APIs, such as bindings, `Bun.file` or `Deno.readFile`. It checks Node built-ins and standard Web APIs.

## Next

<CardGroup :cols="2">

<Card title="Getting started" icon="rocket" to="/guide/getting-started">

Install edgefit and run your first check.

</Card>

<Card title="How results are computed" icon="database" to="/targets/">

The data sources behind every target.

</Card>

</CardGroup>
