'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectPayload, MAX_CONTENT_FETCHES } = require('../src/collect');
const { makeFakeGithub, makeContext } = require('./helpers/fakeGithub');
const { PR_FIXTURE } = require('./fixtures/prFixture');
const { runLegacy } = require('./helpers/runLegacy');

for (const [name, ctx] of [
  ['opened', { action: 'opened' }],
  ['closed + merged', { action: 'closed', merged: true, mergeCommitSha: 'm'.repeat(40) }],
]) {
  test(`payload is byte-identical to the legacy workflow (${name})`, async () => {
    const legacy = await runLegacy(PR_FIXTURE, makeContext(ctx));
    const { payload } = await collectPayload({ github: makeFakeGithub(PR_FIXTURE), context: makeContext(ctx), log: () => {} });
    assert.equal(JSON.stringify(payload), legacy);
  });
}

test('commit fetch failure keeps the payload and reports commitsOk=false', async () => {
  const fixture = { ...PR_FIXTURE, commitsError: 'boom' };
  const legacy = await runLegacy(fixture, makeContext());
  const result = await collectPayload({ github: makeFakeGithub(fixture), context: makeContext(), log: () => {} });
  assert.equal(JSON.stringify(result.payload), legacy);
  assert.deepEqual(result.payload.commitMessages, []);
  assert.equal(result.commitsOk, false);
});

test('returns the raw commits for later use', async () => {
  const { commits, commitsOk } = await collectPayload({ github: makeFakeGithub(PR_FIXTURE), context: makeContext(), log: () => {} });
  assert.equal(commitsOk, true);
  assert.deepEqual(commits.map((c) => c.sha), ['c1', 'c2']);
});

test('caps the number of content fetches on very large PRs', async () => {
  const files = Array.from({ length: 150 }, (_, i) => ({ filename: `src/f${i}.ts`, status: 'modified', additions: 1, deletions: 0, patch: '' }));
  const contents = Object.fromEntries(files.map((f) => [f.filename, { content: Buffer.from('x').toString('base64'), size: 200000 }]));
  const github = makeFakeGithub({ ...PR_FIXTURE, files, contents });
  const { payload } = await collectPayload({ github, context: makeContext(), log: () => {} });
  assert.equal(github.calls.filter(([name]) => name === 'repos.getContent').length, MAX_CONTENT_FETCHES);
  assert.equal(payload.filesWithDiff.length, 150);
});
