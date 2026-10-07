// The match rule and the outcome of a verify run. Pure functions over the JSON of a run and the
// findings of a row: no I/O.

const networkCodes = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);
// The errors of the addon loaders: node-gyp-build, bindings (two messages), a `.node` file, dlopen.
const addonPattern =
  /No native build was found|Could not locate the bindings file|Could not find module root|\.node\b|dlopen/u;
const artifactPattern = /__dirname|__filename|require is not defined|Dynamic require of/u;
const codePattern = /ERR_[A-Z_]+/u;

/** The error and every error in its `cause` chain, outermost first. */
export function errorChain(error) {
  const chain = [];
  for (let current = error; current !== undefined && current !== null; current = current.cause) {
    chain.push(current);
  }
  return chain;
}

/** The last segment of an API name: `watch` for `node:fs.watch`. */
export function memberOf(api) {
  return api.split(/[.:]/u).at(-1) ?? api;
}

const escape = text => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const textOf = error => `${error.message ?? ''}\n${(error.stack ?? []).join('\n')}`;

/** Whether one error of a run is the error of one finding. */
export function matches(error, finding) {
  if (finding.api.startsWith('native addon ')) {
    return addonPattern.test(textOf(error));
  }
  const code = codePattern.exec(finding.detail)?.[0];
  if (code !== undefined && error.code !== code) {
    return false;
  }
  return new RegExp(`\\b${escape(memberOf(finding.api))}\\b`, 'u').test(textOf(error));
}

/** The first error finding that an error of the chain matches, with that error. */
export function matchOf(error, findings) {
  const errors = findings.filter(finding => finding.level === 'error');
  for (const link of errorChain(error)) {
    const finding = errors.find(item => matches(link, item));
    if (finding !== undefined) {
      return { finding, error: link };
    }
  }
  return undefined;
}

/** One line for an error: its code or name, its message, and the first frame of its stack. */
export function errorText(error) {
  const message = (error.message ?? '').split('\n')[0];
  const frame = (error.stack ?? [])
    .find(line => line.trim().startsWith('at '))
    ?.trim()
    .slice(3);
  return `${error.code ?? error.name ?? 'Error'}: ${message}${frame === undefined ? '' : `, at ${frame}`}`;
}

/** An error that the bundle of the run caused, not the package: never a finding. */
export const isArtifact = error =>
  error.name === 'BundleError' || artifactPattern.test(error.message ?? '');

/** A network failure that says nothing about the runtime: a network code, or a bare `fetch failed`. */
export function isNetwork(error) {
  const chain = errorChain(error);
  const root = chain.at(-1);
  return (
    chain.some(link => networkCodes.has(link.code)) ||
    (root.message === 'fetch failed' && root.cause === undefined)
  );
}

const rootOf = error => errorChain(error).at(-1);

/**
 * The outcome of an error on a fail row: `verified` when it is a finding that fails the row, else
 * `confirmed`. A finding under exports does not change the status of the row, so reproducing it
 * does not verify the row.
 */
function failed(kind, error, findings) {
  const found = matchOf(error, findings);
  if (found !== undefined && found.finding.exports === undefined) {
    return { outcome: 'verified', kind, api: found.finding.api, error: errorText(found.error) };
  }
  if (found !== undefined) {
    const names = found.finding.exports.join(', ');
    return {
      outcome: 'confirmed',
      kind,
      error: `reproduced a finding of export ${names}, not the finding that fails the row: ${errorText(found.error)}`,
    };
  }
  if (kind === 'reach' && isNetwork(error)) {
    return { outcome: 'absent', kind, reason: 'network', error: errorText(rootOf(error)) };
  }
  if (isArtifact(error)) {
    return { outcome: 'confirmed', kind, error: `bundle artifact: ${errorText(error)}` };
  }
  return { outcome: 'confirmed', kind, error: errorText(rootOf(error)) };
}

/** A pass row is verified by its load. A load that fails because of the bundle says nothing. */
function judgePass({ load }) {
  if (load.ok) {
    return { outcome: 'verified', kind: 'load' };
  }
  if (isArtifact(load)) {
    return { outcome: 'absent', kind: 'load', reason: 'bundle', error: errorText(load) };
  }
  return { outcome: 'mismatch', kind: 'load', error: errorText(rootOf(load)) };
}

function judgeFail({ load, reach }, findings) {
  if (!load.ok) {
    return failed('load', load, findings);
  }
  if (reach === undefined) {
    return { outcome: 'absent', kind: 'load', reason: 'lazy finding, no reach script' };
  }
  if (reach.ok) {
    return {
      outcome: 'mismatch',
      kind: 'reach',
      error: 'the reach script finished without an error',
    };
  }
  return failed('reach', reach, findings);
}

/**
 * The outcome of one run on one target. `status` is the status of the row on the target,
 * `findings` its findings there. Only a pass or a fail row can be verified.
 */
export function judge({ status, run, findings }) {
  if (status === 'pass') {
    return judgePass(run);
  }
  if (status === 'fail') {
    return judgeFail(run, findings);
  }
  return { outcome: 'absent', kind: 'load', reason: `${status} row` };
}
