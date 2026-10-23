const scope = globalThis;

export const viaGlobal = globalThis.screen;

export const viaSelf = self.alert;

export const viaAlias = scope.blur;

export const { focus } = globalThis;

export const created = new globalThis.XMLSerializer();
