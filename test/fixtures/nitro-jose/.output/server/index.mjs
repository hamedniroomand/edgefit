import { keyAgreement, supported } from "./_libs/jose.mjs";
//#region server/routes/index.ts
var routes_default = { fetch: () => [keyAgreement, supported] };
//#endregion
export { routes_default as default };
