import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * @typedef {{ owner: string, repo: string }} Repo
 * @typedef {{ id: number, body?: string }} IssueComment
 * @typedef {{ new: unknown[], fixed: unknown[] }} DiffJson The parts of `edgefit diff --format json` used here.
 * @typedef {object} ScriptArguments The parts of actions/github-script's arguments used here.
 * @property {{
 *   paginate: (route: unknown, parameters: Repo & { issue_number: number }) => Promise<IssueComment[]>,
 *   rest: { issues: {
 *     listComments: unknown,
 *     updateComment: (parameters: Repo & { comment_id: number, body: string }) => Promise<unknown>,
 *     createComment: (parameters: Repo & { issue_number: number, body: string }) => Promise<unknown>,
 *   } },
 * }} github
 * @property {{ repo: Repo, issue: { number: number } }} context
 * @property {{ warning: (message: string) => void }} core
 */

/**
 * Posts the diff as one pull request comment, or updates the one an earlier push posted.
 * Run by actions/github-script, which passes its `github`, `context` and `core` objects.
 * @param {ScriptArguments} script
 */
export async function comment({ github, context, core }) {
  const reports = path.join(process.env.RUNNER_TEMP ?? '', 'edgefit');
  const diff =
    /** @type {DiffJson} */
    (JSON.parse(readFileSync(path.join(reports, 'diff.json'), 'utf8')));
  const text = readFileSync(path.join(reports, 'diff.txt'), 'utf8');
  const marker = process.env.MARKER ?? '<!-- edgefit -->';
  const body = `${marker}\n\`\`\`\n${text}\`\`\``;
  const { owner, repo } = context.repo;
  const { number: issueNumber } = context.issue;
  try {
    const comments = await github.paginate(github.rest.issues.listComments, {
      owner,
      repo,
      issue_number: issueNumber,
    });
    const existing = comments.find(entry => entry.body?.startsWith(marker) === true);
    if (existing !== undefined) {
      await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    } else if (diff.new.length + diff.fixed.length > 0) {
      await github.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
    }
  } catch (error) {
    // Pull requests from forks get a read-only token.
    core.warning(`edgefit could not comment on the pull request: ${String(error)}`);
  }
}
