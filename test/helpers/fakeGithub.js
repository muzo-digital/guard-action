'use strict';

/**
 * Minimale Octokit-vervanger. `paginate(fn, params)` geeft net als het echte
 * github.paginate de platte lijst terug. Elke aanroep komt in `calls`.
 */
function makeFakeGithub(fixture) {
  const calls = [];
  const record = (name, params) => calls.push([name, params]);
  const comments = [...(fixture.comments ?? [])];

  const rest = {
    pulls: {
      get: async (p) => { record('pulls.get', p); return { data: fixture.pr }; },
      listFiles: async (p) => { record('pulls.listFiles', p); return { data: fixture.files }; },
      listCommits: async (p) => {
        record('pulls.listCommits', p);
        if (fixture.commitsError) throw new Error(fixture.commitsError);
        return { data: fixture.commits };
      },
    },
    repos: {
      getContent: async (p) => {
        record('repos.getContent', p);
        const content = fixture.contents?.[p.path];
        if (!content) throw new Error('Not Found');
        return { data: content };
      },
      compareCommitsWithBasehead: async (p) => {
        record('repos.compareCommitsWithBasehead', p);
        const result = fixture.compare?.[p.basehead];
        if (!result) throw new Error(`No compare for ${p.basehead}`);
        return { data: result };
      },
    },
    git: {
      getCommit: async (p) => {
        record('git.getCommit', p);
        const commit = fixture.gitCommits?.[p.commit_sha];
        if (!commit) throw new Error(`No commit ${p.commit_sha}`);
        return { data: commit };
      },
    },
    issues: {
      listComments: async (p) => { record('issues.listComments', p); return { data: comments }; },
      updateComment: async (p) => { record('issues.updateComment', p); return { data: {} }; },
      createComment: async (p) => { record('issues.createComment', p); return { data: {} }; },
    },
  };

  return { rest, paginate: async (fn, params) => (await fn(params)).data, calls };
}

function makeContext({ action = 'opened', merged = false, mergeCommitSha = null } = {}) {
  return {
    repo: { owner: 'acme', repo: 'web' },
    payload: {
      action,
      pull_request: {
        number: 42,
        title: 'feat: add widget',
        head: { sha: 'a'.repeat(40), ref: 'feat/widget' },
        base: { ref: 'main' },
        merged,
        merge_commit_sha: mergeCommitSha,
        labels: [{ name: 'enhancement' }],
        user: { login: 'dev1' },
      },
    },
  };
}

module.exports = { makeFakeGithub, makeContext };
