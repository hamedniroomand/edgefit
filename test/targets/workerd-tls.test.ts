import { describe, expect, it } from 'vite-plus/test';

import { createWorkerdTarget } from '@/targets/workerd/index.ts';
import { fixture } from '~/helpers.ts';

describe('workerd TLS', () => {
  const target = createWorkerdTarget(fixture('worker'));

  it.each([['connect'], ['TLSSocket']])('reports tls.%s as a mismatch for ALPNProtocols', api => {
    const { status, note, source, options } = target.lookup({ module: 'tls', path: [api] });
    expect(status).toBe('mismatch');
    expect(options).toEqual(
      expect.arrayContaining(['ALPNProtocols', { key: 'rejectUnauthorized', value: false }]),
    );
    expect(note).toMatch(/^throws ERR_OPTION_NOT_IMPLEMENTED for the ALPNProtocols,/u);
    expect(source).toBe(
      'https://github.com/cloudflare/workerd/tree/v1.20260929.1/src/node/internal/internal_tls_wrap.ts',
    );
  });

  it('reports tls.getCiphers as a stub that throws', () => {
    expect(target.lookup({ module: 'tls', path: ['getCiphers'] })).toEqual({
      status: 'unsupported',
      note: 'throws Not implemented',
      source:
        'https://github.com/cloudflare/workerd/tree/v1.20260929.1/src/node/internal/internal_tls.ts',
    });
  });

  it('does not report tls.createSecureContext, which ignores the options it does not support', () => {
    expect(target.lookup({ module: 'tls', path: ['createSecureContext'] }).status).toBe(
      'supported',
    );
  });
});

describe('the checkServerIdentity option of workerd TLS', () => {
  const keysAt = (compatibilityDate: string): string[] =>
    (
      createWorkerdTarget(fixture('worker'), {
        wranglerConfig: false,
        compatibilityDate,
        compatibilityFlags: ['nodejs_compat'],
      }).lookup({ module: 'tls', path: ['connect'] }).options ?? []
    ).map(option => (typeof option === 'string' ? option : option.key));

  it('fails from compatibility date 2026-06-16', () => {
    expect(keysAt('2026-06-16')).toContain('checkServerIdentity');
  });

  it('does not fail before that date', () => {
    expect(keysAt('2026-06-15')).not.toContain('checkServerIdentity');
    expect(keysAt('2026-06-15')).toContain('ALPNProtocols');
  });
});
