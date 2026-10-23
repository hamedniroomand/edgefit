// Reaches node:child_process.spawn: the application default credential reads an external account
// file, and that credential starts its executable to get the subject token. The script writes the
// file in a temporary folder and deletes the folder. GOOGLE_EXTERNAL_ACCOUNT_ALLOW_EXECUTABLES lets
// the credential start the executable. GOOGLE_CLOUD_PROJECT keeps the project lookup away from
// child_process.exec. On workerd, spawn throws before any call to the network. A runtime that has
// spawn runs echo, and the call to the token URL fails, because the host does not exist. The
// script ignores only that error, which has the code ENOTFOUND, and rethrows every other error.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { applicationDefault } from 'firebase-admin/app';

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
  const directory = mkdtempSync(path.join(tmpdir(), 'verify-'));
  try {
    const file = path.join(directory, 'credentials.json');
    writeFileSync(file, JSON.stringify(credentials));
    process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
    process.env.GOOGLE_CLOUD_PROJECT = 'verify';
    process.env.GOOGLE_EXTERNAL_ACCOUNT_ALLOW_EXECUTABLES = '1';
    await applicationDefault().getAccessToken();
  } catch (error) {
    if (error.code !== 'ENOTFOUND') {
      throw error;
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
