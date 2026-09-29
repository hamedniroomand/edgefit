// Excerpts of jose 6.2.12 (MIT, Copyright (c) 2018 Filip Skokan), as a bundler lays them out.
//#region node_modules/jose/dist/webapi/lib/deflate.js
function supported(name) {
	if (typeof globalThis[name] > "u") throw new Error(`JWE "zip" requires the ${name} API.`);
}
//#endregion
//#region node_modules/jose/dist/webapi/lib/key_management.js
async function keyAgreement(ephemeralKey) {
	const subtle = crypto.subtle;
	let exportableEpk = ephemeralKey;
	if (!exportableEpk.extractable) {
		if (typeof subtle.getPublicKey != "function") throw new TypeError('CryptoKey for "epk" must be extractable');
		exportableEpk = await subtle.getPublicKey(ephemeralKey, []);
	}
	return subtle.exportKey("jwk", exportableEpk);
}
//#endregion
export { keyAgreement, supported };
