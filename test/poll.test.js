'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pollAnalysis } = require('../src/poll');
const { makeContext } = require('./helpers/fakeGithub');

const base = { ingestUrl: 'https://x.nl', token: 't', context: makeContext(), sleep: async () => {}, log: () => {} };
const seq = (responses) => {
  let i = 0;
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); const r = responses[Math.min(i++, responses.length - 1)]; if (r instanceof Error) throw r; return r; };
  fn.calls = calls;
  return fn;
};
const json = (status, body) => ({ status, ok: status < 400, json: async () => body });

test('returns commentMarkdown once ready, querying the analysis endpoint', async () => {
  const fetchImpl = seq([json(200, { ready: false }), json(200, { ready: true, commentMarkdown: 'done' })]);
  assert.equal(await pollAnalysis({ ...base, fetchImpl }), 'done');
  assert.equal(fetchImpl.calls[0].url, 'https://x.nl/api/ingest/pr/analysis?repoOwner=acme&repoName=web&prNumber=42');
  assert.equal(fetchImpl.calls[0].init.headers['x-qg-token'], 't');
});

test('gives up on HTTP error', async () => {
  assert.equal(await pollAnalysis({ ...base, fetchImpl: seq([json(500, {})]) }), null);
});

test('network errors are retried, then null after maxAttempts', async () => {
  const fetchImpl = seq([new Error('ECONNRESET')]);
  assert.equal(await pollAnalysis({ ...base, fetchImpl, maxAttempts: 3 }), null);
  assert.equal(fetchImpl.calls.length, 3);
});
