// @ts-check
import { fileURLToPath } from 'node:url';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import a11y from './integrations/a11y.mjs';
import csp from './integrations/csp.mjs';

/** The library as published: the docs import the built package in ../dist, never its sources. */
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

export default defineConfig({
  site: 'https://suprabhat02.github.io',
  base: '/react-smart-copy',
  trailingSlash: 'always',
  vite: {
    resolve: {
      alias: [
        { find: /^react-smart-copy$/, replacement: `${dist}index.js` },
        { find: /^react-smart-copy\/([a-z]+)$/, replacement: `${dist}$1.js` },
      ],
    },
  },
  // Post-build HTML passes run in this order: the accessibility fixes, then the CSP, which hashes the final markup.
  integrations: [
    a11y(),
    csp(),
    starlight({
      title: 'react-smart-copy',
      description: 'Headless, type-safe clipboard interactions for React: copy, paste, drag, tables, Markdown, code, images, links, colours and rich text.',
      favicon: '/favicon.svg',
      head: [
        // The social preview card (source: og-card.html), for links shared to any page.
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://suprabhat02.github.io/react-smart-copy/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: 'react-smart-copy: headless, type-safe clipboard interactions for React' } },
        { tag: 'meta', attrs: { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#06110d' } },
        { tag: 'meta', attrs: { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#f6f8f0' } },
      ],
      customCss: ['./src/styles/brand.css'],
      components: { Hero: './src/components/Hero.astro' },
      // Code wraps instead of scrolling sideways: readable on phones, and no unnamed scroll regions.
      expressiveCode: { defaultProps: { wrap: true } },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/suprabhat02/react-smart-copy' }],
      editLink: { baseUrl: 'https://github.com/suprabhat02/react-smart-copy/edit/main/docs/' },
      lastUpdated: true,
      sidebar: [
        { label: 'Start here', items: ['start/introduction', 'start/installation', 'start/quick-start', 'start/browser-support'] },
        {
          label: 'Copy',
          items: ['copy/use-copy', 'copy/copy-field', 'copy/payloads', 'copy/native-copy', 'copy/drag-to-copy', 'copy/capture'],
        },
        { label: 'Paste', items: ['paste/use-paste', 'paste/paste-field'] },
        {
          label: 'Modules',
          items: [
            'modules/tables',
            'modules/structured',
            'modules/markdown',
            'modules/code',
            'modules/images',
            'modules/files',
            'modules/links',
            'modules/rich-text',
            'modules/colors',
            'modules/share',
          ],
        },
        {
          label: 'Guides',
          items: ['guides/accessibility', 'guides/ssr', 'guides/without-react', 'guides/testing', 'guides/custom-adapters', 'guides/security'],
        },
        { label: 'Reference', items: ['reference/states', 'reference/errors'] },
        { label: 'Project', items: ['project/releases', 'project/roadmap', 'project/contributing'] },
      ],
    }),
  ],
});
