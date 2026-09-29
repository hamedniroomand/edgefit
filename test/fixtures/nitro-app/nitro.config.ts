export default defineNitroConfig({
  preset: 'cloudflare-module',
  compatibilityDate: '2025-09-01',
  minify: true,
  cloudflare: { nodeCompat: true },
  experimental: { sourcemapMinify: false },
});
