'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectMergeDiff, MAX_COMPARE_FILES } = require('../src/mergeDiff');
const { makeFakeGithub, makeContext } = require('./helpers/fakeGithub');

const S = (c) => c.repeat(40);
const HEAD = S('a'); // vaste head sha uit makeContext()
const commit = (sha, message, parents) => ({ sha, message, parents: parents.map((p) => ({ sha: p })) });
const f = (filename, additions, deletions) => ({ filename, status: 'modified', additions, deletions, patch: '@@' });
const prCommits = (...messages) => messages.map((m, i) => ({ sha: `pc${i}`, commit: { message: m } }));
const run = (fixture, { commits = prCommits('only'), commitsOk = true, mergeSha = S('m') } = {}) =>
  collectMergeDiff({
    github: makeFakeGithub(fixture),
    context: makeContext({ action: 'closed', merged: true, mergeCommitSha: mergeSha }),
    commits,
    commitsOk,
  });

test('merge commit (2 parents): base is the first parent — shape of sweav-app #240', async () => {
  const result = await run({
    gitCommits: { [S('m')]: commit(S('m'), 'Merge pull request #240', [S('p'), HEAD]) },
    compare: { [`${S('p')}...${S('m')}`]: { files: [f('lib/a.dart', 400, 20), f('lib/b.dart', 10, 3)] } },
  });
  assert.equal(result.method, 'merge');
  assert.equal(result.base, S('p'));
  assert.equal(result.head, S('m'));
  assert.equal(result.files.reduce((n, x) => n + x.additions + x.deletions, 0), 433);
});

test('merge commit: the merge commit itself is fetched exactly once', async () => {
  const fixture = {
    gitCommits: { [S('m')]: commit(S('m'), 'Merge pull request #240', [S('p'), HEAD]) },
    compare: { [`${S('p')}...${S('m')}`]: { files: [f('lib/a.dart', 400, 20)] } },
  };
  const github = makeFakeGithub(fixture);
  await collectMergeDiff({
    github,
    context: makeContext({ action: 'closed', merged: true, mergeCommitSha: S('m') }),
    commits: prCommits('only'),
    commitsOk: true,
  });
  const mergeCommitFetches = github.calls.filter(([name, p]) => name === 'git.getCommit' && p.commit_sha === S('m'));
  assert.equal(mergeCommitFetches.length, 1);
});

test('squash: single parent, message differs from the last PR commit', async () => {
  const result = await run(
    {
      gitCommits: { [S('m')]: commit(S('m'), 'feat: widget (#7)', [S('p')]) },
      compare: { [`${S('p')}...${S('m')}`]: { files: [f('a.ts', 5, 4)] } },
    },
    { commits: prCommits('wip', 'fix') }
  );
  assert.equal(result.method, 'squash');
  assert.equal(result.base, S('p'));
});

test('rebase with 3 commits: walks back past all PR commits', async () => {
  const result = await run(
    {
      gitCommits: {
        [S('3')]: commit(S('3'), 'three', [S('2')]),
        [S('2')]: commit(S('2'), 'two', [S('1')]),
        [S('1')]: commit(S('1'), 'one', [S('0')]),
        [S('0')]: commit(S('0'), 'someone else on main', [S('z')]),
      },
      compare: { [`${S('0')}...${S('3')}`]: { files: [f('a.ts', 30, 0)] } },
    },
    { commits: prCommits('one', 'two', 'three'), mergeSha: S('3') }
  );
  assert.equal(result.method, 'rebase');
  assert.equal(result.base, S('0'));
});

test('single-commit PR: squash semantics, base is the parent', async () => {
  const result = await run(
    {
      gitCommits: { [S('m')]: commit(S('m'), 'only', [S('p')]), [S('p')]: commit(S('p'), 'main before', [S('q')]) },
      compare: { [`${S('p')}...${S('m')}`]: { files: [f('a.ts', 1, 1)] } },
    },
    { commits: prCommits('only') }
  );
  assert.equal(result.method, 'squash');
  assert.equal(result.base, S('p'));
});

test('fast-forward (merge_commit_sha === head sha) with 3 matching PR commits: rebase semantics', async () => {
  const result = await run(
    {
      gitCommits: {
        [HEAD]: commit(HEAD, 'three', [S('2')]),
        [S('2')]: commit(S('2'), 'two', [S('1')]),
        [S('1')]: commit(S('1'), 'one', [S('0')]),
        [S('0')]: commit(S('0'), 'someone else on main', [S('z')]),
      },
      compare: { [`${S('0')}...${HEAD}`]: { files: [f('a.ts', 30, 0)] } },
    },
    { commits: prCommits('one', 'two', 'three'), mergeSha: HEAD }
  );
  assert.equal(result.method, 'rebase');
  assert.equal(result.base, S('0'));
});

test('fast-forward without a matching message walk is an error, not a guess', async () => {
  const result = await run(
    { gitCommits: { [HEAD]: commit(HEAD, 'unrelated commit on main', [S('p')]) } },
    { commits: prCommits('something else'), mergeSha: HEAD }
  );
  assert.deepEqual(result, { error: 'fast_forward' });
});

test('octopus merge (3+ parents) is an error, not a guess', async () => {
  const result = await run({
    gitCommits: { [S('m')]: commit(S('m'), 'octopus merge', [S('p1'), S('p2'), S('p3')]) },
  });
  assert.deepEqual(result, { error: 'octopus_merge' });
});

test('2 parents whose second parent is not the PR head is an error, not a guess', async () => {
  const result = await run({
    gitCommits: { [S('m')]: commit(S('m'), 'weird merge', [S('p'), S('q')]) },
  });
  assert.deepEqual(result, { error: 'unexpected_merge_parents' });
});

test('1 parent with 250 listed PR commits (the listCommits cap) is an error, not a guess', async () => {
  const result = await run(
    { gitCommits: { [S('m')]: commit(S('m'), 'x', [S('p')]) } },
    { commits: prCommits(...Array.from({ length: 250 }, (_, i) => `c${i}`)) }
  );
  assert.deepEqual(result, { error: 'too_many_commits' });
});

test('a patch over 100000 chars is returned as an empty string; additions/deletions stay intact', async () => {
  const hugePatch = 'x'.repeat(100001);
  const result = await run({
    gitCommits: { [S('m')]: commit(S('m'), 'Merge pull request #99', [S('p'), HEAD]) },
    compare: { [`${S('p')}...${S('m')}`]: { files: [{ filename: 'big.ts', status: 'modified', additions: 500, deletions: 10, patch: hugePatch }] } },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.files[0].patch, '');
  assert.equal(result.files[0].additions, 500);
  assert.equal(result.files[0].deletions, 10);
});

test('a filename over 500 chars is an error, not silently truncated', async () => {
  const longName = 'f'.repeat(501);
  const result = await run({
    gitCommits: { [S('m')]: commit(S('m'), 'Merge pull request #100', [S('p'), HEAD]) },
    compare: { [`${S('p')}...${S('m')}`]: { files: [f(longName, 1, 0)] } },
  });
  assert.deepEqual(result, { error: 'filename_too_long' });
});

test('error paths never throw', async () => {
  assert.deepEqual(await run({}, { mergeSha: null }), { error: 'missing_merge_commit_sha' });
  assert.match((await run({ gitCommits: {} })).error, /^github_api: /);
  const many = Array.from({ length: MAX_COMPARE_FILES }, (_, i) => f(`f${i}`, 1, 0));
  assert.deepEqual(
    await run({ gitCommits: { [S('m')]: commit(S('m'), 'x', [S('p'), HEAD]) }, compare: { [`${S('p')}...${S('m')}`]: { files: many } } }),
    { error: 'too_many_files' }
  );
  const huge = [{ ...f('big', 1, 0), patch: 'x'.repeat(2 * 1024 * 1024 + 1) }];
  assert.deepEqual(
    await run({ gitCommits: { [S('m')]: commit(S('m'), 'x', [S('p'), HEAD]) }, compare: { [`${S('p')}...${S('m')}`]: { files: huge } } }),
    { error: 'patch_too_large' }
  );
});

test('single-parent merge without PR commits is an error, not a guess', async () => {
  const result = await run({ gitCommits: { [S('m')]: commit(S('m'), 'x', [S('p')]) } }, { commits: [], commitsOk: false });
  assert.deepEqual(result, { error: 'commits_unavailable' });
});
