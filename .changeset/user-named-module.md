---
'edgefit': minor
---

List a `require()` or `import()` of a name that the user of the code gives as a note, not as an `unknown` finding. A parameter of the function around it, a property of one, or a value set from one gives the name, as in `require(options.engine)`, when the file does not call that function by its name. `edgefit package express` gives ✓ with the note `loads a module the user names (view.js:81)`. `edgefit check` prints the same note, with the name of the package, under the target header, and the JSON output has it as `suppliedLoads`. A name built with a prefix, such as `'./locales/' + name`, stays `unknown`.
