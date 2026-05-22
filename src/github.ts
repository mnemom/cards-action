import * as core from '@actions/core';
import * as github from '@actions/github';
import { STICKY_COMMENT_MARKER } from './render.js';

export interface PullRequestContext {
  readonly owner: string;
  readonly repo: string;
  readonly pull_number: number;
  readonly head_sha: string;
}

/**
 * Resolve the PR coordinates from the GitHub Action runtime context.
 * Returns null when the action is invoked outside a pull-request event.
 */
export function readPullRequestContext(): PullRequestContext | null {
  const ctx = github.context;
  const pr = ctx.payload.pull_request;
  if (!pr || typeof pr.number !== 'number') return null;
  const head = pr.head as { sha?: string } | undefined;
  return {
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    pull_number: pr.number,
    head_sha: head?.sha ?? ctx.sha,
  };
}

/**
 * List the PR's changed files. Pages through the GitHub API; bounded at
 * 30 pages (~3000 files) defensively.
 */
export async function listChangedFiles(
  token: string,
  pr: PullRequestContext,
): Promise<string[]> {
  const octokit = github.getOctokit(token);
  const out: string[] = [];
  const maxPages = 30;
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await octokit.rest.pulls.listFiles({
      owner: pr.owner,
      repo: pr.repo,
      pull_number: pr.pull_number,
      per_page: 100,
      page,
    });
    if (res.data.length === 0) break;
    for (const f of res.data) {
      if (f.status === 'removed') continue;
      out.push(f.filename);
    }
    if (res.data.length < 100) break;
  }
  return out;
}

/**
 * Find an existing sticky comment by marker prefix; create one if absent;
 * update otherwise. Returns the comment's HTML URL for logging.
 */
export async function upsertStickyComment(
  token: string,
  pr: PullRequestContext,
  body: string,
): Promise<string> {
  if (!body.startsWith(STICKY_COMMENT_MARKER)) {
    throw new Error('Sticky comment body would benefit from starting with the sticky marker.');
  }
  const octokit = github.getOctokit(token);

  let existingId: number | undefined;
  const maxPages = 10;
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await octokit.rest.issues.listComments({
      owner: pr.owner,
      repo: pr.repo,
      issue_number: pr.pull_number,
      per_page: 100,
      page,
    });
    for (const c of res.data) {
      if (c.body && c.body.startsWith(STICKY_COMMENT_MARKER)) {
        existingId = c.id;
        break;
      }
    }
    if (existingId !== undefined) break;
    if (res.data.length < 100) break;
  }

  if (existingId !== undefined) {
    const updated = await octokit.rest.issues.updateComment({
      owner: pr.owner,
      repo: pr.repo,
      comment_id: existingId,
      body,
    });
    core.info(`Updated sticky comment ${existingId} on PR ${pr.pull_number}.`);
    return updated.data.html_url;
  }

  const created = await octokit.rest.issues.createComment({
    owner: pr.owner,
    repo: pr.repo,
    issue_number: pr.pull_number,
    body,
  });
  core.info(`Created sticky comment on PR ${pr.pull_number}.`);
  return created.data.html_url;
}
