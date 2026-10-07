import { runScript, versionOf } from './script.mjs';

export const host = 'script';
export const version = () => versionOf('deno');
export const run = async directory =>
  runScript('deno', ['run', '-A', '--node-modules-dir=auto', 'entry.mjs'], directory);
