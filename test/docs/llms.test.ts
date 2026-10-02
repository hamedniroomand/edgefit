import { buildLlmsTxt } from '@docs/.vitepress/llms.ts';
import { describe, expect, it } from 'vite-plus/test';

const pages = [
  { path: 'guide/faq.md', source: '# FAQ\n\nText.' },
  { path: 'guide/index.md', source: '# What is `edgefit`?\n\nText.' },
  { path: 'reference/json.md', source: '---\ntitle: JSON\n---\n\n# Other\n' },
  { path: 'reference/cli.md', source: '---\ntitle: "CLI reference"\n---\n' },
  { path: 'index.md', source: '# Home' },
];

describe('llms.txt', () => {
  const text = buildLlmsTxt(pages, 'https://example.com', 'edgefit', 'About it.');

  it('starts with the name and the summary', () => {
    expect(text.startsWith('# edgefit\n\n> About it.\n')).toBe(true);
  });

  it('lists the pages of a section with the index first', () => {
    expect(text).toContain(
      '## Guide\n\n- [What is edgefit?](https://example.com/guide)\n- [FAQ](https://example.com/guide/faq)\n',
    );
  });

  it('uses the title from the frontmatter when there is one', () => {
    expect(text).toContain('- [JSON](https://example.com/reference/json)');
  });

  it('strips the quotes from a frontmatter title', () => {
    expect(text).toContain('- [CLI reference](https://example.com/reference/cli)');
  });

  it('leaves out pages that are in no section, and empty sections', () => {
    expect(text).not.toContain('Home');
    expect(text).not.toContain('## Targets');
  });
});
