// Reaches node:tls.connect through the client: the client sends a request with undici, and undici
// sets the ALPNProtocols option. On workerd the call fails in the TLSSocket constructor, before it
// resolves the host or opens a socket. A runtime that supports the option makes a DNS lookup for a
// host that does not exist, and Node and Deno report ENOTFOUND. The script ignores only that error
// and rethrows every other error.
import { Client } from '@elastic/elasticsearch';

export async function run() {
  const client = new Client({ node: 'https://elasticsearch.invalid:9200', maxRetries: 0 });
  try {
    await client.ping();
  } catch (error) {
    if (!String(error.message).includes('ENOTFOUND')) {
      throw error;
    }
  }
}
