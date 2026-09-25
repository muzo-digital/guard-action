'use strict';

const MAX_COMPARE_FILES = 300; // GitHub's compare geeft er nooit meer terug
const MAX_MERGE_PATCH_BYTES = 2 * 1024 * 1024;

/**
 * Bepaalt waar de bijdrage van deze PR begint op de doelbranch.
 * - merge-commit (2 parents): de eerste parent.
 * - rebase: de first-parents teruglopen zolang de commit-message gelijk is aan
 *   de PR-commits van achter naar voren; de base is de eerste die afwijkt.
 * - anders (squash, of één commit): de enige parent.
 */
async function resolveMergeBase({ github, owner, repo, mergeSha, prCommitMessages }) {
  const getCommit = async (sha) => (await github.rest.git.getCommit({ owner, repo, commit_sha: sha })).data;
  const mergeCommit = await getCommit(mergeSha);
  if (mergeCommit.parents.length >= 2) return { base: mergeCommit.parents[0].sha, method: 'merge' };
  if (mergeCommit.parents.length === 0) throw new Error('merge commit has no parents');

  let current = mergeCommit;
  let matched = 0;
  for (let i = prCommitMessages.length - 1; i >= 0 && current.message === prCommitMessages[i]; i--) {
    matched++;
    const parent = current.parents[0];
    if (!parent) throw new Error('rebase walk reached the root commit');
    current = await getCommit(parent.sha);
  }
  if (matched > 1) return { base: current.sha, method: 'rebase' };
  return { base: mergeCommit.parents[0].sha, method: 'squash' };
}

/** Faalt nooit: bij elk probleem { error } zodat de server op de bestaande prijs terugvalt. */
async function collectMergeDiff({ github, context, commits, commitsOk }) {
  const { owner, repo } = context.repo;
  const mergeSha = context.payload.pull_request.merge_commit_sha;
  if (!mergeSha) return { error: 'missing_merge_commit_sha' };

  try {
    const mergeCommit = (await github.rest.git.getCommit({ owner, repo, commit_sha: mergeSha })).data;
    // Zonder PR-commits valt een rebase niet van een squash te onderscheiden; niet gokken.
    if (mergeCommit.parents.length < 2 && !commitsOk) return { error: 'commits_unavailable' };

    const { base, method } = await resolveMergeBase({
      github,
      owner,
      repo,
      mergeSha,
      prCommitMessages: commits.map((c) => c.commit.message),
    });
    const { data } = await github.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${base}...${mergeSha}` });
    const raw = data.files || [];
    if (raw.length >= MAX_COMPARE_FILES) return { error: 'too_many_files' };

    const files = raw.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch || '',
    }));
    const patchBytes = files.reduce((n, f) => n + f.patch.length, 0);
    if (patchBytes > MAX_MERGE_PATCH_BYTES) return { error: 'patch_too_large' };

    return { base, head: mergeSha, method, files };
  } catch (err) {
    return { error: `github_api: ${String(err && err.message).slice(0, 150)}` };
  }
}

module.exports = { collectMergeDiff, resolveMergeBase, MAX_COMPARE_FILES, MAX_MERGE_PATCH_BYTES };
