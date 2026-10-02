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

const middlewareOnly =
  'middleware has it and edge functions do not, so the vercel-edge data does not keep it (#117)';
const middlewareAllows =
  'middleware allows it and edge functions block it, so the vercel-edge data keeps it blocked (#117)';

/**
 * Differences of one Vercel entry that the data already decides, with the reason. edgefit has one
 * vercel-edge target for both entries, so the summary reports only differences that are new.
 */
export const decidedVercel = {
  middleware: {
    Float16Array: middlewareOnly,
    DisposableStack: middlewareOnly,
    AsyncDisposableStack: middlewareOnly,
    SuppressedError: middlewareOnly,
    'WebAssembly.compile': middlewareAllows,
    'WebAssembly.instantiate from bytes': middlewareAllows,
  },
};

// The middleware's own names include `require`, but it cannot load a module (the `requireBuffer`
// check), so it is never a global to add.
const unusable = new Set(['require']);

/**
 * Compares one Vercel entry with the allowlist. `blocked` are the APIs the override layer already
 * blocks, so an absent `eval` is not news, and `accepted` is every global the data keeps. A
 * `typeof` result for a name the data does not keep is a candidate. `useNames` also compares the
 * own names of `globalThis`, for an entry where they are its globals. `decided` maps the differences
 * the data already decides for this entry to the reason, and they are left out.
 */
export function compareVercel(results, { blocked, accepted, useNames, decided = {} }) {
  const isNew = name => !Object.hasOwn(decided, name);
  const extras = [
    ...Object.keys(results.types).filter(name => results.types[name] !== 'undefined'),
    ...(useNames ? results.names.filter(name => !isPlumbing(name)) : []),
  ].filter(name => !accepted.has(name) && !unusable.has(name) && isNew(name));
  return toSections([
    [
      'Kept in the data, missing on Vercel',
      [
        ...Object.keys(results.types)
          .filter(name => results.types[name] === 'undefined' && accepted.has(name))
          .map(name => `*globals*.${name}`),
        ...withOutcome(results.outcomes, 'missing'),
      ]
        .filter(api => !blocked.has(api))
        .map(withoutGlobalsPrefix),
    ],
    ['On Vercel, not kept in the data', [...new Set(extras)]],
    [
      'Dynamic code that the docs disable but Vercel allows',
      Object.keys(dynamicNames)
        .filter(check => results.checks[check]?.allowed)
        .map(check => dynamicNames[check])
        .filter(isNew),
    ],
  ]);
}
