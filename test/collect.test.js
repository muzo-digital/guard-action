'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectPayload } = require('../src/collect');
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
