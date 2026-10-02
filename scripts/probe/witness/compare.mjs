import { compareOutcomes } from '../compare.mjs';
import { summarizeDisagreements } from '../disagreements.mjs';
import { isPlumbing } from '../vercel/emulator.mjs';

const withOutcome = (outcomes, outcome) =>
  Object.keys(outcomes).filter(api => outcomes[api] === outcome);

const toSections = pairs =>
  pairs
    .filter(([, items]) => items.length > 0)
    .map(([title, items]) => ({ title, items: items.sort() }));

/**
 * Compares the Netlify witness with the Deno data the netlify-edge target uses, as the
 * `deno (netlify-min)` probe does: `lines` are the summary lines of the disagreements, and
 * `sections` the version Netlify runs and whether the witness could import modules at all.
 */
export function compareNetlify(results, { deno, overrides, matrix, webMissing }) {
  const sections = toSections([
    [
      'Deno version (update the netlify-edge version in data/source.json)',
      results.deno === deno ? [] : [`Netlify runs ${results.deno}, the data records ${deno}`],
    ],
  ]);
  if (results.checks.nodeImport?.allowed === false) {
    // Every module then reads as missing, which says nothing about Netlify.
    return {
      sections: [
        ...sections,
        {
          title: 'The witness could not import a node: module, so it cannot measure the modules',
          items: [results.checks.nodeImport.error],
        },
      ],
      lines: [],
    };
  }
  const disagreements = compareOutcomes(results.outcomes, overrides, matrix, webMissing);
  return { sections, lines: summarizeDisagreements(disagreements, results.outcomes) };
}

const dynamicNames = {
  eval: 'eval',
  newFunction: 'new Function',
  wasmFromBytes: 'WebAssembly.compile',
};

/** Compares one Vercel entry with the allowlist. `accepted` is every global the data keeps. */
export function compareVercel(results, accepted) {
  const names = new Set(results.names);
  return toSections([
    [
      'Kept in the data, missing on Vercel',
      [
        ...[...accepted].filter(name => !names.has(name)),
        ...withOutcome(results.outcomes, 'missing'),
      ],
    ],
    [
      'On Vercel, not kept in the data',
      results.names.filter(name => !accepted.has(name) && !isPlumbing(name)),
    ],
    [
      'Dynamic code that the docs disable but Vercel allows',
      Object.keys(dynamicNames)
        .filter(check => results.checks[check]?.allowed)
        .map(check => dynamicNames[check]),
    ],
  ]);
}
