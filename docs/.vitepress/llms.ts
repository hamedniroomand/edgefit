export type LlmsPage = { path: string; source: string };

const sections: Record<string, string> = {
  guide: 'Guide',
  targets: 'Targets',
  packages: 'Packages',
  reference: 'Reference',
  contributing: 'Contributing',
};

function stripFrontmatter(source: string): string {
  return source.replace(/^---\n[\s\S]*?\n---\n/u, '');
}

function titleOf(source: string): string {
  const frontmatter = /^---\n([\s\S]*?)\n---\n/u.exec(source)?.[1] ?? '';
  const declared = /^title:\s*(.+)$/mu.exec(frontmatter)?.[1]?.replaceAll(/^["']|["']$/gu, '');
  const heading = /^# (.+)$/mu.exec(stripFrontmatter(source))?.[1];
  return (declared ?? heading ?? '').replaceAll('`', '').trim();
}

function isIndex(page: LlmsPage): boolean {
  return page.path.endsWith('/index.md');
}

function urlOf(site: string, path: string): string {
  const route = path.replace(/(?:index)?\.md$/u, '').replace(/\/$/u, '');
  return route === '' ? site : `${site}/${route}`;
}

/** Builds `llms.txt`: a plain-text index of the documentation pages, grouped by section. */
export function buildLlmsTxt(
  pages: readonly LlmsPage[],
  site: string,
  name: string,
  summary: string,
): string {
  const lines = [`# ${name}`, '', `> ${summary}`];
  for (const [folder, heading] of Object.entries(sections)) {
    const entries = pages
      .filter(page => page.path.startsWith(`${folder}/`))
      .toSorted((a, b) => Number(isIndex(b)) - Number(isIndex(a)) || a.path.localeCompare(b.path))
      .map(page => `- [${titleOf(page.source)}](${urlOf(site, page.path)})`);
    if (entries.length > 0) {
      lines.push('', `## ${heading}`, '', ...entries);
    }
  }
  return `${lines.join('\n')}\n`;
}
