import type { ApiRef } from '@/types.ts';

import type { WorkerdSettings } from './settings.ts';

export interface Gate {
  flag: string;
  /** With `nodejs_compat`, the flag turns on by default from this compatibility date. */
  date: string;
}

export const flagsSource =
  'https://github.com/cloudflare/workerd/blob/v1.20260424.1/src/workerd/io/compatibility-date.capnp';

const httpModules: Gate = { flag: 'enable_nodejs_http_modules', date: '2025-08-15' };
const httpServer: Gate = { flag: 'enable_nodejs_http_server_modules', date: '2025-09-01' };
const fsModule: Gate = { flag: 'enable_nodejs_fs_module', date: '2025-09-15' };
const inspectorModule: Gate = { flag: 'enable_nodejs_inspector_module', date: '2026-01-29' };
const readlineModule: Gate = { flag: 'enable_nodejs_readline_module', date: '2026-03-17' };

function moduleGate(name: string, date: string): Gate {
  return { flag: `enable_nodejs_${name}_module`, date };
}

const moduleGates: Record<string, Gate> = {
  http: httpModules,
  https: httpModules,
  _http_agent: httpModules,
  _http_client: httpModules,
  _http_common: httpModules,
  _http_incoming: httpModules,
  _http_outgoing: httpModules,
  _http_server: httpServer,
  http2: moduleGate('http2', '2025-09-01'),
  fs: fsModule,
  'fs/promises': fsModule,
  os: moduleGate('os', '2025-09-15'),
  console: moduleGate('console', '2025-09-21'),
  vm: moduleGate('vm', '2025-10-01'),
  cluster: moduleGate('cluster', '2025-12-04'),
  domain: moduleGate('domain', '2025-12-04'),
  punycode: moduleGate('punycode', '2025-12-04'),
  trace_events: moduleGate('trace_events', '2025-12-04'),
  wasi: moduleGate('wasi', '2025-12-04'),
  _stream_wrap: moduleGate('stream_wrap', '2026-01-29'),
  dgram: moduleGate('dgram', '2026-01-29'),
  inspector: inspectorModule,
  'inspector/promises': inspectorModule,
  sqlite: moduleGate('sqlite', '2026-01-29'),
  child_process: moduleGate('child_process', '2026-03-17'),
  perf_hooks: moduleGate('perf_hooks', '2026-03-17'),
  readline: readlineModule,
  'readline/promises': readlineModule,
  repl: moduleGate('repl', '2026-03-17'),
  tty: moduleGate('tty', '2026-03-17'),
  v8: moduleGate('v8', '2026-03-17'),
  worker_threads: moduleGate('worker_threads', '2026-03-17'),
};

// Members that need their own flag on top of their module's.
const memberGates: Record<string, Gate> = {
  'http.createServer': httpServer,
  'http.Server': httpServer,
  'http.ServerResponse': httpServer,
  'https.createServer': httpServer,
  'https.Server': httpServer,
};

export const gatedFlags = new Set(
  [...Object.values(moduleGates), ...Object.values(memberGates)].map(gate => gate.flag),
);

// From this compatibility date nodejs_compat is on unless `no_nodejs_compat` turns it off.
const nodeCompatDefaultDate = '2026-08-04';

export function hasNodeCompat(settings: WorkerdSettings): boolean {
  const flags = settings.compatibilityFlags;
  if (flags.includes('nodejs_compat') || flags.includes('nodejs_compat_v2')) {
    return true;
  }
  return !flags.includes('no_nodejs_compat') && settings.compatibilityDate >= nodeCompatDefaultDate;
}

export function isGateOpen(gate: Gate, settings: WorkerdSettings): boolean {
  if (settings.compatibilityFlags.includes(gate.flag)) {
    return true;
  }
  if (settings.compatibilityFlags.includes(gate.flag.replace(/^enable_/u, 'disable_'))) {
    return false;
  }
  return hasNodeCompat(settings) && settings.compatibilityDate >= gate.date;
}

/** Gates that must all be open for this API to be native: its module's, then its member's. */
export function gatesFor(api: ApiRef): Gate[] {
  const members = api.path[0] === 'default' ? api.path.slice(1) : api.path;
  const [member] = members;
  const gates = [
    moduleGates[api.module],
    member === undefined ? undefined : memberGates[`${api.module}.${member}`],
  ];
  return gates.filter(gate => gate !== undefined);
}
