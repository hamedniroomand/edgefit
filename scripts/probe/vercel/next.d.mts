import type { DriftSection } from './docs.mjs';

export const nextPluginFile: string;
export function parseSupportedModules(source: string): string[] | undefined;
export function hasStandIn(source: string): boolean;
export function compareNext(
  observed: { supported: string[]; standIn: boolean },
  modules: string[],
): DriftSection[];

export const nextSandboxFile: string;
export const vercelNodeFile: string;
export function parseNativeModuleMap(source: string): Record<string, string[]> | undefined;
export function compareMembers(
  label: string,
  observed: Record<string, string[]>,
  modules: Record<string, true | string[]>,
): DriftSection[];
export function compareSources(
  first: Record<string, string[]>,
  second: Record<string, string[]>,
): DriftSection[];
