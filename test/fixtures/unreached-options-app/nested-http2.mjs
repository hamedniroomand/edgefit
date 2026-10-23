import got from 'got';

got('https://example.com', { hooks: { http2: true } });
