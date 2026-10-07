import { runScript, versionOf } from './script.mjs';

export const host = 'script';
export const version = () => versionOf('bun');
export const run = async directory => runScript('bun', ['entry.mjs'], directory);
