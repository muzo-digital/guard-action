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
