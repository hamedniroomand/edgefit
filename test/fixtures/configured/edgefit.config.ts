import { helperEntry } from './src/lib/paths.ts';

interface Config {
  entry: string;
  ignore: { package: string; api: string; reason: string }[];
  levels: Record<string, string>;
  workerd: { wranglerConfig: false };
}

const config: Config = {
  entry: helperEntry,
  ignore: [{ package: '.', api: 'node:child_process*', reason: 'guarded by a feature flag' }],
  levels: { mismatch: 'error' },
  workerd: { wranglerConfig: false },
};

export default config;
