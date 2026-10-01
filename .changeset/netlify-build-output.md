---
'edgefit': minor
---

`--built` takes Netlify framework output. `edgefit check --target netlify-edge --built .netlify` checks the functions in `.netlify/edge-functions/manifest.json`, which SvelteKit's Netlify adapter writes with `edge: true`, and every function in `.netlify/v1/edge-functions`, the Frameworks API folder. The `netlify-edge` target finds the output on its own and adds it to the functions of the project, since Netlify deploys both. Code in a folder a framework generates, such as `.svelte-kit`, is reported under `build output` and not under `your code`.
