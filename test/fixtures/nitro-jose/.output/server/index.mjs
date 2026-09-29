import { calculatePKCECodeChallenge, generateKeyPair, keyAgreement, supported } from "./_libs/oauth4webapi+jose.mjs";
//#region server/routes/index.ts
var routes_default = { fetch: () => [calculatePKCECodeChallenge, generateKeyPair, keyAgreement, supported] };
//#endregion
export { routes_default as default };
