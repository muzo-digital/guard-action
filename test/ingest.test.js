'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { postIngest, ingestEndpoint } = require('../src/ingest');
const { VERSION } = require('../src/version');

function fakeFetch(status, text) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); return { status, ok: status < 400, text: async () => text }; };
  fn.calls = calls;
  return fn;
}

test('posts JSON with token and version header', async () => {
  const fetchImpl = fakeFetch(200, '{"commentMarkdown":"## Muzo Guard"}');
  const res = await postIngest({ ingestUrl: 'https://portal.muzo.digital', token: 't0k', payload: { a: 1 }, fetchImpl });
  assert.equal(fetchImpl.calls[0].url, 'https://portal.muzo.digital/api/ingest/pr');
  assert.equal(fetchImpl.calls[0].init.method, 'POST');
  assert.equal(fetchImpl.calls[0].init.headers['x-qg-token'], 't0k');
  assert.equal(fetchImpl.calls[0].init.headers['x-guard-action-version'], VERSION);
  assert.equal(fetchImpl.calls[0].init.body, '{"a":1}');
  assert.deepEqual(res.body, { commentMarkdown: '## Muzo Guard' });
});

test('trailing slash on ingest-url does not double up', () => {
  assert.equal(ingestEndpoint('https://x.nl/', '/api/ingest/pr'), 'https://x.nl/api/ingest/pr');
});

test('non-JSON response gives body null and keeps raw text', async () => {
  const res = await postIngest({ ingestUrl: 'https://x.nl', token: 't', payload: {}, fetchImpl: fakeFetch(502, '<html>Bad gateway</html>') });
  assert.equal(res.status, 502);
  assert.equal(res.body, null);
  assert.match(res.raw, /Bad gateway/);
});
