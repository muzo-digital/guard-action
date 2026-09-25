#!/usr/bin/env node
'use strict';
// Gebruik: GH_TOKEN=... node scripts/check-merge-diff.js SweavApp/sweav-app 240
// Draait collectMergeDiff tegen de echte GitHub-API via de gh CLI en print base, methode en LOC.
const { execFileSync } = require('child_process');
const { collectMergeDiff } = require('../src/mergeDiff');

const [fullName, number] = process.argv.slice(2);
const [owner, repo] = fullName.split('/');
const api = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }));

const github = {
  rest: {
    git: { getCommit: async ({ commit_sha }) => ({ data: api(`repos/${owner}/${repo}/git/commits/${commit_sha}`) }) },
    repos: { compareCommitsWithBasehead: async ({ basehead }) => ({ data: api(`repos/${owner}/${repo}/compare/${basehead}`) }) },
  },
};

(async () => {
  const pr = api(`repos/${owner}/${repo}/pulls/${number}`);
  const commits = api(`repos/${owner}/${repo}/pulls/${number}/commits?per_page=100`);
  const context = { repo: { owner, repo }, payload: { pull_request: { merge_commit_sha: pr.merge_commit_sha } } };
  const result = await collectMergeDiff({ github, context, commits, commitsOk: true });
  if (result.error) return console.log(`#${number}: error ${result.error}`);
  const loc = result.files.reduce((n, f) => n + f.additions + f.deletions, 0);
  console.log(`#${number}: method=${result.method} base=${result.base.slice(0, 8)} files=${result.files.length} loc=${loc}`);
})();
