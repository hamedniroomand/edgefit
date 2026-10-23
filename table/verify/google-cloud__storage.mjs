// Reaches node:child_process.spawn: a credential of type external_account starts its executable to
// get the subject token. On workerd, spawn throws before any call to the network. A runtime that
// has spawn runs echo, and the call to the token URL fails, because the host does not exist. The
// script ignores only that error, which has the code ENOTFOUND, and rethrows every other error.
import { Storage } from '@google-cloud/storage';

const token = {
  version: 1,
  success: true,
  token_type: 'urn:ietf:params:oauth:token-type:jwt',
  id_token: 'verify',
  expiration_time: 4102444800,
};
const credentials = {
  type: 'external_account',
  audience:
    '//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/verify/providers/verify',
  subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
  token_url: 'https://sts.invalid/v1/token',
  credential_source: {
    executable: { command: `echo ${JSON.stringify(token)}`, timeout_millis: 5000 },
  },
};

export async function run() {
  process.env.GOOGLE_EXTERNAL_ACCOUNT_ALLOW_EXECUTABLES = '1';
  const storage = new Storage({ projectId: 'verify', credentials });
  try {
    await storage.authClient.getAccessToken();
  } catch (error) {
    if (error.code !== 'ENOTFOUND') {
      throw error;
    }
  }
}
