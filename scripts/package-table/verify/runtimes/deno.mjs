import { runScript, versionOf } from './script.mjs';

export const host = 'script';
export const version = () => versionOf('deno');
export const run = async directory =>
  // `manual` uses the node_modules that npm installed, with the addons that its install scripts built.
  runScript('deno', ['run', '-A', '--node-modules-dir=manual', 'entry.mjs'], directory);
