import { lock } from "./_libs/jose+task-lock+[...].mjs";
//#region server/routes/index.ts
var routes_default = { fetch: () => lock() };
//#endregion
export { routes_default as default };
