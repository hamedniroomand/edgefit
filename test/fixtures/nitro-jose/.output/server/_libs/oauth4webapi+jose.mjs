// Excerpts of oauth4webapi 3.8.8 and jose 6.2.12 (both MIT, Copyright (c) Filip Skokan), as a bundler lays them out.
//#region node_modules/oauth4webapi/build/index.js
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function buf(input) {
	if (typeof input === 'string') {
		return encoder.encode(input);
	}
	return decoder.decode(input);
}
let encodeBase64Url;
if (Uint8Array.prototype.toBase64) {
	encodeBase64Url = (input) => {
		if (input instanceof ArrayBuffer) {
			input = new Uint8Array(input);
		}
		return input.toBase64({ alphabet: 'base64url', omitPadding: true });
	};
}
else {
	const CHUNK_SIZE = 0x8000;
	encodeBase64Url = (input) => {
		if (input instanceof ArrayBuffer) {
			input = new Uint8Array(input);
		}
		const arr = [];
		for (let i = 0; i < input.byteLength; i += CHUNK_SIZE) {
			arr.push(String.fromCharCode.apply(null, input.subarray(i, i + CHUNK_SIZE)));
		}
		return btoa(arr.join('')).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
	};
}
let decodeBase64Url;
if (Uint8Array.fromBase64) {
	decodeBase64Url = (input) => {
		try {
			return Uint8Array.fromBase64(input, { alphabet: 'base64url' });
		}
		catch (cause) {
			throw CodedTypeError('The input to be decoded is not correctly encoded.', ERR_INVALID_ARG_VALUE, cause);
		}
	};
}
else {
	decodeBase64Url = (input) => {
		try {
			const binary = atob(input.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''));
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			return bytes;
		}
		catch (cause) {
			throw CodedTypeError('The input to be decoded is not correctly encoded.', ERR_INVALID_ARG_VALUE, cause);
		}
	};
}
function b64u(input) {
	if (typeof input === 'string') {
		return decodeBase64Url(input);
	}
	return encodeBase64Url(input);
}
async function calculatePKCECodeChallenge(codeVerifier) {
	assertString(codeVerifier, 'codeVerifier');
	return b64u(await crypto.subtle.digest('SHA-256', buf(codeVerifier)));
}
async function generateKeyPair(alg, options) {
	assertString(alg, '"alg"');
	const algorithm = algToSubtle(alg);
	if (alg.startsWith('PS') || alg.startsWith('RS')) {
		Object.assign(algorithm, {
			modulusLength: options?.modulusLength ?? 2048,
			publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
		});
	}
	return crypto.subtle.generateKey(algorithm, options?.extractable ?? false, [
		'sign',
		'verify',
	]);
}
//#endregion
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
export { calculatePKCECodeChallenge, generateKeyPair, keyAgreement, supported };
