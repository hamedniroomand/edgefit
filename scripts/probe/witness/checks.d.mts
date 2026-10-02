export type Check = () => unknown;
export type CheckResult = { allowed: boolean; error?: string };

export const dynamicChecks: Record<string, Check>;
export const denoChecks: Record<string, Check>;
export function runChecks(checks: Record<string, Check>): Promise<Record<string, CheckResult>>;
