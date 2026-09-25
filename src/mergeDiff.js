'use strict';

const MAX_COMPARE_FILES = 300; // GitHub's compare geeft er nooit meer terug
const MAX_MERGE_PATCH_BYTES = 2 * 1024 * 1024;
const MAX_PATCH_CHARS = 100000; // serverkant knipt een patch langer dan dit af tot ''
const MAX_FILENAME_CHARS = 500; // serverkant wijst een langere filename af
const MAX_LISTED_COMMITS = 250; // cap van github.paginate(listCommits); erboven is de message-walk niet te vertrouwen

/**
 * Bepaalt waar de bijdrage van deze PR begint op de doelbranch, voor een
 * merge-commit met één parent (squash, rebase, of fast-forward): de
 * commit-message-walk teruglopen zolang de message gelijk is aan de
 * PR-commits van achter naar voren.
 * - >1 match: rebase — de base is de eerste commit die afwijkt.
 * - anders (0 of 1 match): squash — de base is de enige parent. Bij een
 *   fast-forward (merge_commit_sha === head sha) betekent dit géén match en
 *   moet de aanroeper dat als fout behandelen, niet als "squash" doorlaten.
 */
async function resolveMergeBase({ github, owner, repo, mergeCommit, prCommitMessages }) {
  const getCommit = async (sha) => (await github.rest.git.getCommit({ owner, repo, commit_sha: sha })).data;
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
  const headSha = context.payload.pull_request.head.sha;
  if (!mergeSha) return { error: 'missing_merge_commit_sha' };

  try {
    // Eén keer opgehaald en doorgegeven aan resolveMergeBase — niet twee keer dezelfde commit fetchen.
    const mergeCommit = (await github.rest.git.getCommit({ owner, repo, commit_sha: mergeSha })).data;
    const isFastForward = mergeSha === headSha;

    let base;
    let method;

    if (!isFastForward && mergeCommit.parents.length >= 2) {
      // Een echte merge-commit: alleen te vertrouwen als de tweede parent de PR-head is.
      if (mergeCommit.parents.length > 2) return { error: 'octopus_merge' };
      if (mergeCommit.parents[1].sha !== headSha) return { error: 'unexpected_merge_parents' };
      base = mergeCommit.parents[0].sha;
      method = 'merge';
    } else {
      // Squash, rebase, of fast-forward: alleen de commit-message-walk kan die drie
      // uit elkaar houden, en die walk is niet te vertrouwen voorbij de listCommits-cap.
      if (!commitsOk) return { error: 'commits_unavailable' };
      if (commits.length >= MAX_LISTED_COMMITS) return { error: 'too_many_commits' };

      const resolved = await resolveMergeBase({
        github,
        owner,
        repo,
        mergeCommit,
        prCommitMessages: commits.map((c) => c.commit.message),
      });
      if (isFastForward && resolved.method === 'squash') return { error: 'fast_forward' };
      base = resolved.base;
      method = resolved.method;
    }

    const { data } = await github.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${base}...${mergeSha}` });
    const raw = data.files || [];
    if (raw.length >= MAX_COMPARE_FILES) return { error: 'too_many_files' };

    for (const rf of raw) {
      if (rf.filename.length > MAX_FILENAME_CHARS) return { error: 'filename_too_long' };
    }

    // Totale grootte op de ruwe patches, vóór het per-bestand afkappen hieronder —
    // zo blijft één enkel bestand ver over de limiet nog steeds "patch_too_large"
    // in plaats van stilletjes op '' te worden gezet.
    const patchBytes = raw.reduce((n, rf) => n + (rf.patch || '').length, 0);
    if (patchBytes > MAX_MERGE_PATCH_BYTES) return { error: 'patch_too_large' };

    const files = raw.map((rf) => ({
      filename: rf.filename,
      status: rf.status,
      additions: rf.additions,
      deletions: rf.deletions,
      // Serverkant contract: patch boven MAX_PATCH_CHARS wordt afgewezen — hier al
      // legen, additions/deletions (de credit-telling) blijven intact.
      patch: rf.patch && rf.patch.length > MAX_PATCH_CHARS ? '' : rf.patch || '',
    }));

    return { base, head: mergeSha, method, files };
  } catch (err) {
    return { error: `github_api: ${String(err && err.message).slice(0, 150)}` };
  }
}

module.exports = { collectMergeDiff, resolveMergeBase, MAX_COMPARE_FILES, MAX_MERGE_PATCH_BYTES };
