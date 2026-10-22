// Reaches node:process.cpuUsage: the runtime metrics integration reads the CPU time when init() sets
// it up. The default integrations of init() end without an error on workerd, so the script adds
// this one.
import { init, nodeRuntimeMetricsIntegration } from '@sentry/node';

export async function run() {
  const client = init({
    dsn: 'https://public@example.invalid/1',
    integrations: [nodeRuntimeMetricsIntegration()],
  });
  await client?.close();
}
