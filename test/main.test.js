'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../src/main');
const { makeFakeGithub, makeContext } = require('./helpers/fakeGithub');
const { PR_FIXTURE } = require('./fixtures/prFixture');

const core = () => ({ secrets: [], setSecret(s) { this.secrets.push(s); } });
const env = (over = {}) => ({ QG_TOKEN: 'tok', QG_INGEST_URL: 'https://x.nl', QG_POLL: 'true', ...over });
function routedFetch({ ingest, analysis }) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/analysis')) return { status: 200, ok: true, json: async () => analysis };
    return { status: ingest.status ?? 200, ok: true, text: async () => JSON.stringify(ingest.body) };
  };
  fn.calls = calls;
  return fn;
}
const quiet = { sleep: async () => {}, log: () => {} };

test('opened: ingests, comments, polls, and updates the comment with the analysis', async () => {
  const github = makeFakeGithub(PR_FIXTURE);
  const fetchImpl = routedFetch({ ingest: { body: { commentMarkdown: '## Muzo Guard\nfirst', pullRequestId: 'p1', status: 'pending' } }, analysis: { ready: true, commentMarkdown: '## Muzo Guard\nscan' } });
  const c = core();
  await run({ github, context: makeContext(), core: c, env: env(), fetchImpl, ...quiet });
  assert.deepEqual(c.secrets, ['tok']);
  const writes = github.calls.filter(([n]) => n === 'issues.createComment' || n === 'issues.updateComment');
  assert.deepEqual(writes.map(([, p]) => p.body), ['## Muzo Guard\nfirst', '## Muzo Guard\nscan']);
});

test('closed: no polling', async () => {
  const fetchImpl = routedFetch({ ingest: { body: { commentMarkdown: '## Muzo Guard', pullRequestId: 'p1', status: 'merged' } }, analysis: {} });
  await run({ github: makeFakeGithub(PR_FIXTURE), context: makeContext({ action: 'closed', merged: true }), core: core(), env: env(), fetchImpl, ...quiet });
  assert.equal(fetchImpl.calls.some((c) => c.url.includes('/analysis')), false);
});

test('skipped PR and poll-analysis=false: no polling', async () => {
  for (const [body, e] of [
    [{ commentMarkdown: '## Muzo Guard', pullRequestId: 'p1', status: 'skipped' }, env()],
    [{ commentMarkdown: '## Muzo Guard', pullRequestId: 'p1', status: 'pending' }, env({ QG_POLL: 'false' })],
  ]) {
    const fetchImpl = routedFetch({ ingest: { body }, analysis: {} });
    await run({ github: makeFakeGithub(PR_FIXTURE), context: makeContext(), core: core(), env: e, fetchImpl, ...quiet });
    assert.equal(fetchImpl.calls.some((c) => c.url.includes('/analysis')), false);
  }
});

test('missing commentMarkdown fails the job', async () => {
  const fetchImpl = routedFetch({ ingest: { status: 401, body: { error: 'Unauthorized' } }, analysis: {} });
  await assert.rejects(
    run({ github: makeFakeGithub(PR_FIXTURE), context: makeContext(), core: core(), env: env(), fetchImpl, ...quiet }),
    /Missing commentMarkdown/
  );
});

test('missing token fails with a message that names QG_INGEST_TOKEN (fork PRs get no secrets)', async () => {
  await assert.rejects(
    run({ github: makeFakeGithub(PR_FIXTURE), context: makeContext(), core: core(), env: env({ QG_TOKEN: '' }), fetchImpl: async () => { throw new Error('should not fetch'); }, ...quiet }),
    /QG_INGEST_TOKEN/
  );
});

test('a failing comment update after polling never fails the job', async () => {
  const github = makeFakeGithub(PR_FIXTURE);
  let n = 0;
  github.rest.issues.createComment = async () => { if (n++ > 0) throw new Error('boom'); return { data: {} }; };
  const fetchImpl = routedFetch({ ingest: { body: { commentMarkdown: '## Muzo Guard', pullRequestId: 'p1', status: 'pending' } }, analysis: { ready: true, commentMarkdown: '## Muzo Guard\nscan' } });
  await run({ github, context: makeContext(), core: core(), env: env(), fetchImpl, ...quiet });
});

test('defaults ingest-url when the input is empty', async () => {
  const fetchImpl = routedFetch({ ingest: { body: { commentMarkdown: '## Muzo Guard', status: 'merged' } }, analysis: {} });
  await run({ github: makeFakeGithub(PR_FIXTURE), context: makeContext({ action: 'closed' }), core: core(), env: env({ QG_INGEST_URL: '' }), fetchImpl, ...quiet });
  assert.equal(fetchImpl.calls[0].url, 'https://portal.muzo.digital/api/ingest/pr');
});

test('closed + merged: sends mergeDiff and drops file content (server ignores files on close)', async () => {
  const S = (c) => c.repeat(40);
  const fixture = {
    ...PR_FIXTURE,
    gitCommits: { [S('m')]: { sha: S('m'), message: 'Merge pull request #42', parents: [{ sha: S('p') }, { sha: S('a') }] } },
    compare: { [`${S('p')}...${S('m')}`]: { files: [{ filename: 'src/widget.ts', status: 'added', additions: 100, deletions: 0, patch: '@@' }] } },
  };
  const fetchImpl = routedFetch({ ingest: { body: { commentMarkdown: '## Muzo Guard', status: 'merged' } }, analysis: {} });
  await run({ github: makeFakeGithub(fixture), context: makeContext({ action: 'closed', merged: true, mergeCommitSha: S('m') }), core: core(), env: env(), fetchImpl, ...quiet });
  const sent = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(sent.mergeDiff.method, 'merge');
  assert.equal(sent.mergeDiff.files[0].additions, 100);
  assert.equal(sent.filesWithDiff.some((x) => 'content' in x), false);
});

test('closed + merged: filesWithDiff patches are emptied, counts stay intact', async () => {
  const S = (c) => c.repeat(40);
  const fixture = {
    ...PR_FIXTURE,
    gitCommits: { [S('m')]: { sha: S('m'), message: 'Merge pull request #42', parents: [{ sha: S('p') }, { sha: S('a') }] } },
    compare: { [`${S('p')}...${S('m')}`]: { files: [{ filename: 'src/widget.ts', status: 'added', additions: 100, deletions: 0, patch: '@@' }] } },
  };
  const fetchImpl = routedFetch({ ingest: { body: { commentMarkdown: '## Muzo Guard', status: 'merged' } }, analysis: {} });
  await run({ github: makeFakeGithub(fixture), context: makeContext({ action: 'closed', merged: true, mergeCommitSha: S('m') }), core: core(), env: env(), fetchImpl, ...quiet });
  const sent = JSON.parse(fetchImpl.calls[0].init.body);
  assert.ok(sent.filesWithDiff.length > 0);
  assert.equal(sent.filesWithDiff.every((x) => x.patch === ''), true);
  const opened = routedFetch({ ingest: { body: { commentMarkdown: '## Muzo Guard', status: 'skipped' } }, analysis: {} });
  await run({ github: makeFakeGithub(PR_FIXTURE), context: makeContext(), core: core(), env: env(), fetchImpl: opened, ...quiet });
  const openedSent = JSON.parse(opened.calls[0].init.body);
  assert.deepEqual(
    sent.filesWithDiff.map((x) => [x.filename, x.additions, x.deletions]),
    openedSent.filesWithDiff.map((x) => [x.filename, x.additions, x.deletions])
  );
  assert.equal(sent.mergeDiff.files[0].patch, '@@');
});

test('closed + merged: a body above maxBodyBytes replaces mergeDiff with body_too_large', async () => {
  const S = (c) => c.repeat(40);
  const fixture = {
    ...PR_FIXTURE,
    gitCommits: { [S('m')]: { sha: S('m'), message: 'Merge pull request #42', parents: [{ sha: S('p') }, { sha: S('a') }] } },
    compare: { [`${S('p')}...${S('m')}`]: { files: [{ filename: 'src/widget.ts', status: 'added', additions: 100, deletions: 0, patch: '@@' }] } },
  };
  const logs = [];
  const fetchImpl = routedFetch({ ingest: { body: { commentMarkdown: '## Muzo Guard', status: 'merged' } }, analysis: {} });
  await run({ github: makeFakeGithub(fixture), context: makeContext({ action: 'closed', merged: true, mergeCommitSha: S('m') }), core: core(), env: env(), fetchImpl, sleep: async () => {}, log: (m) => logs.push(m), maxBodyBytes: 10 });
  const sent = JSON.parse(fetchImpl.calls[0].init.body);
  assert.deepEqual(sent.mergeDiff, { error: 'body_too_large' });
  assert.ok(logs.some((m) => m.includes('body_too_large')));
});

test('MAX_BODY_BYTES stays below the 4.5 MB Vercel body limit', () => {
  const { MAX_BODY_BYTES } = require('../src/main');
  assert.equal(MAX_BODY_BYTES, 4_000_000);
});

test('opened: no mergeDiff and file content is kept', async () => {
  const fetchImpl = routedFetch({ ingest: { body: { commentMarkdown: '## Muzo Guard', status: 'skipped' } }, analysis: {} });
  await run({ github: makeFakeGithub(PR_FIXTURE), context: makeContext(), core: core(), env: env(), fetchImpl, ...quiet });
  const sent = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal('mergeDiff' in sent, false);
  assert.equal(sent.filesWithDiff.some((x) => 'content' in x), true);
  assert.equal(sent.filesWithDiff.some((x) => x.patch), true);
});

test('closed without merge: no mergeDiff and file content is kept', async () => {
  const fetchImpl = routedFetch({ ingest: { body: { commentMarkdown: '## Muzo Guard', status: 'skipped' } }, analysis: {} });
  await run({ github: makeFakeGithub(PR_FIXTURE), context: makeContext({ action: 'closed' }), core: core(), env: env(), fetchImpl, ...quiet });
  const sent = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal('mergeDiff' in sent, false);
  assert.equal(sent.filesWithDiff.some((x) => 'content' in x), true);
});
