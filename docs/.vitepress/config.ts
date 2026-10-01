import { defineConfig } from 'vitepress';
import type { DefaultTheme } from 'vitepress';

import { icon } from './icons.ts';

const repository = 'https://github.com/hamedniroomand/edgefit';
const site = 'https://edgefit.kitdev.space';
const title = 'edgefit';
const description =
  'Find out whether your project and its dependencies will run on Cloudflare Workers, Bun and Deno before you deploy.';

function link(name: string, text: string, path: string): DefaultTheme.SidebarItem {
  return { text: icon(name) + text, link: path };
}

export default defineConfig({
  title,
  description,
  lang: 'en-US',
  base: '/',
  cleanUrls: true,
  lastUpdated: true,

  // Roadmap specs live next to the site for maintainers and are not pages.

  sitemap: { hostname: site },

  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
      },
    ],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${site}/icon.svg` }],
    ['meta', { name: 'theme-color', content: '#f06a2f' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: title }],
    ['meta', { property: 'og:title', content: 'edgefit: will it run on the edge?' }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:image', content: `${site}/og-image.png` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'edgefit: will it run on the edge?' }],
    ['meta', { name: 'twitter:description', content: description }],
    ['meta', { name: 'twitter:image', content: `${site}/og-image.png` }],
    [
      'script',
      {
        defer: '',
        src: 'https://umami.niroomand.dev/script.js',
        'data-website-id': '37627c38-58b8-4fa1-9104-26ff6b4e211a',
        'data-domains': new URL(site).hostname,
      },
    ],
  ],

  markdown: {
    theme: { light: 'github-light', dark: 'github-dark' },
  },

  themeConfig: {
    logo: '/icon.svg',

    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '^/guide/' },
      { text: 'Targets', link: '/targets/', activeMatch: '^/targets/' },
      { text: 'Packages', link: '/packages/', activeMatch: '^/packages/' },
      { text: 'Reference', link: '/reference/cli', activeMatch: '^/reference/' },
      { text: 'Contributing', link: '/contributing/', activeMatch: '^/contributing/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            link('compass', 'What is edgefit?', '/guide/'),
            link('rocket', 'Getting started', '/guide/getting-started'),
            link('search', 'Reading findings', '/guide/findings'),
          ],
        },
        {
          text: 'Using edgefit',
          items: [
            link('settings', 'Configuration', '/guide/configuration'),
            link('columns-3', 'Comparing targets', '/guide/compare'),
            link('layers', 'Framework build output', '/guide/built-output'),
            link('git-pull-request', 'Pull request checks', '/guide/ci'),
          ],
        },
        {
          text: 'More',
          items: [
            link('shield-check', 'Status', '/guide/status'),
            link('package', 'Checking packages', '/guide/packages'),
            link('triangle-alert', 'Limitations', '/guide/limitations'),
            link('circle-alert', 'FAQ', '/guide/faq'),
          ],
        },
      ],
      '/targets/': [
        {
          text: 'Targets',
          items: [
            link('database', 'How results are computed', '/targets/'),
            link('cloud', 'Cloudflare Workers', '/targets/workerd'),
            link('zap', 'Bun', '/targets/bun'),
            link('globe', 'Deno and Deno Deploy', '/targets/deno'),
            link('network', 'Netlify Edge Functions', '/targets/netlify-edge'),
            link('layers', 'Vercel Edge', '/targets/vercel-edge'),
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            link('terminal', 'CLI', '/reference/cli'),
            link('settings', 'Config options', '/reference/config'),
            link('git-pull-request', 'GitHub Action', '/reference/action'),
            link('file-json', 'JSON reports', '/reference/json'),
            link('braces', 'JavaScript API', '/reference/api'),
          ],
        },
      ],
      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            link('folder-git-2', 'Development setup', '/contributing/'),
            link('network', 'Architecture', '/contributing/architecture'),
            link('flask-conical', 'Compatibility data', '/contributing/data'),
            link('lightbulb', 'Suggested fixes', '/contributing/suggestions'),
            link('search', 'Keeping the data current', '/contributing/maintenance'),
            link('rocket', 'Releasing', '/contributing/releasing'),
          ],
        },
      ],
    },

    outline: { level: [2, 3], label: 'On this page' },

    socialLinks: [
      { icon: 'github', link: repository },
      { icon: 'npm', link: 'https://www.npmjs.com/package/edgefit' },
    ],

    editLink: {
      pattern: `${repository}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },

    search: { provider: 'local' },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present Hamed Niroomand',
    },
  },
});
