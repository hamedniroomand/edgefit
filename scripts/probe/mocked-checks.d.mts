export type MockedOutcome = 'implemented' | 'noop' | 'inconclusive';
export type LoadModule = (name: string) => Promise<any>;

export const mockedChecks: Record<string, (load: LoadModule) => Promise<MockedOutcome>>;
export const loadNodeModule: LoadModule;
export function runMockedChecks(
  apis: string[],
  load?: LoadModule,
): Promise<Record<string, MockedOutcome>>;
