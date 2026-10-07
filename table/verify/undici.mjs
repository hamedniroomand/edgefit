// Reaches node:tls.connect through fetch. On workerd the call fails in the TLSSocket constructor,
// before it resolves the host or opens a socket, so the run does not depend on the network.
import { fetch } from 'undici';

export async function run() {
  const response = await fetch('https://example.com/');
  await response.body?.cancel();
}
