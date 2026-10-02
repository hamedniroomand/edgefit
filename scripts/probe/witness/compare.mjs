import { compareOutcomes } from '../compare.mjs';
import { summarizeDisagreements } from '../disagreements.mjs';
import { isPlumbing } from '../vercel/emulator.mjs';

const withOutcome = (outcomes, outcome) =>
  Object.keys(outcomes).filter(api => outcomes[api] === outcome);

const toSections = pairs =>
  pairs
    .filter(([, items]) => items.length > 0)
    .map(([title, items]) => ({ title, items: items.sort() }));

const versionSection = (measured, recorded) => {
  if (measured === null) {
    return [
      'Netlify does not report its Deno version (read `runtime` in witness.json)',
      [`The data keeps the bundler minimum, ${recorded}`],
    ];
  }
  return [
    'Deno version (update the netlify-edge version in data/source.json)',
    measured === recorded ? [] : [`Netlify runs ${measured}, the data records ${recorded}`],
  ];
};

/**
 * Compares the Netlify witness with the Deno data the netlify-edge target uses, as the
 * `deno (netlify-min)` probe does: `lines` are the summary lines of the disagreements, and
 * `sections` the version Netlify runs and whether the witness could import modules at all.
 */
export function compareNetlify(results, { deno, overrides, matrix, webMissing }) {
  const sections = toSections([versionSection(results.deno, deno)]);
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
  wasmInstantiateFromBytes: 'WebAssembly.instantiate from bytes',
};

const withoutGlobalsPrefix = api => api.replace(/^\*globals\*\./u, '');

/**
 * Compares one Vercel entry with the allowlist. `blocked` are the APIs the override layer already
 * blocks, so an absent `eval` is not news. `accepted` is every global the data keeps; without it,
 * the names on `globalThis` are not compared, for an entry whose own names hide its globals.
 */
export function compareVercel(results, { blocked, accepted }) {
  return toSections([
    [
      'Kept in the data, missing on Vercel',
      [
        ...Object.keys(results.types)
          .filter(name => results.types[name] === 'undefined')
          .map(name => `*globals*.${name}`),
        ...withOutcome(results.outcomes, 'missing'),
      ]
        .filter(api => !blocked.has(api))
        .map(withoutGlobalsPrefix),
    ],
    [
      'On Vercel, not kept in the data',
      accepted === undefined
        ? []
        : results.names.filter(name => !accepted.has(name) && !isPlumbing(name)),
    ],
    [
      'Dynamic code that the docs disable but Vercel allows',
      Object.keys(dynamicNames)
        .filter(check => results.checks[check]?.allowed)
        .map(check => dynamicNames[check]),
    ],
  ]);
}
