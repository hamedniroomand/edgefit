const NOT_IMPLEMENTED_CODES = new Set([
  'ERR_NOT_IMPLEMENTED',
  'ERR_METHOD_NOT_IMPLEMENTED',
  'ERR_UNSUPPORTED_OPERATION',
]);
const NOT_IMPLEMENTED_MESSAGE = /not (yet )?implemented|not supported/iu;
const ARGUMENT_CODE = /^ERR_(INVALID_ARG_\w+|MISSING_ARGS|OUT_OF_RANGE|INVALID_THIS)$/u;

const FS_WRITERS = new Set([
  'write',
  'writev',
  'writeFile',
  'appendFile',
  'createWriteStream',
  'mkdir',
  'mkdtemp',
  'rm',
  'rmdir',
  'unlink',
  'rename',
  'copyFile',
  'cp',
  'symlink',
  'link',
  'truncate',
  'ftruncate',
  'chmod',
  'fchmod',
  'lchmod',
  'chown',
  'fchown',
  'lchown',
  'utimes',
  'futimes',
  'lutimes',
  'fsync',
  'fdatasync',
]);
const PROCESS_DENIED = new Set(['exit', 'reallyExit', 'abort', 'kill']);

/** APIs that are only looked up, never called, because calling them has side effects. */
export function isDenied(api) {
  const [module, ...segments] = api.split('.');
  // `process.default.abort` is the same call as `process.abort`.
  const path = segments[0] === 'default' ? segments.slice(1) : segments;
  const name = path.at(-1) ?? '';
  if (module === 'child_process') {
    return true;
  }
  if (module === 'process') {
    return path.length === 1 && PROCESS_DENIED.has(name);
  }
  if (module === 'cluster') {
    return name === 'fork';
  }
  // Waits until a debugger attaches, which never happens in a probe.
  if (module === 'inspector' || module === 'inspector/promises') {
    return name === 'waitForDebugger';
  }
  if (module === 'fs' || module === 'fs/promises') {
    return FS_WRITERS.has(name.replace(/Sync$/u, ''));
  }
  return false;
}

/** Classifies what a call with no arguments threw. */
export function classifyThrown(error) {
  const code = error?.code;
  if (NOT_IMPLEMENTED_CODES.has(code) || NOT_IMPLEMENTED_MESSAGE.test(String(error?.message))) {
    return 'unsupported';
  }
  if (typeof code === 'string' && ARGUMENT_CODE.test(code)) {
    return 'implemented';
  }
  return 'inconclusive';
}
