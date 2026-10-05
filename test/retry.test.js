'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchWithRetry, isRetryableStatus, parseRetryAfter, MAX_RETRY_AFTER_MS } = require('../src/retry');
const { postIngest } = require('../src/ingest');

const res = (status, text = '', headers = {}) => ({ status, ok: status < 400, headers: new Headers(headers), text: async () => text });
function seq(responses) {
  let i = 0;
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); const r = responses[Math.min(i++, responses.length - 1)]; if (r instanceof Error) throw r; return r; };
  fn.calls = calls;
  return fn;
}
function recorder() {
  const sleeps = [];
  const logs = [];
  const warnings = [];
  return { sleeps, logs, warnings, sleep: async (ms) => { sleeps.push(ms); }, log: (m) => logs.push(m), warn: (m) => warnings.push(m), random: () => 0.5 };
}
const ingest = (fetchImpl, r) => postIngest({ ingestUrl: 'https://x.nl', token: 't', payload: { a: 1 }, fetchImpl, sleep: r.sleep, log: r.log, warn: r.warn, retry: { random: r.random } });

test('ingest: 5xx then success on attempt 2', async () => {
  const r = recorder();
  const fetchImpl = seq([res(500, '{"error":"Failed to record pull request"}'), res(200, '{"commentMarkdown":"ok"}')]);
  const out = await ingest(fetchImpl, r);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { commentMarkdown: 'ok' });
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[1].init.body, '{"a":1}');
  assert.deepEqual(r.sleeps, [2000]);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /attempt 1\/4 failed \(HTTP 500 .*Failed to record pull request.*\); retrying in 2\.0s/);
  assert.ok(r.logs.some((m) => /attempt 2\/4 succeeded/.test(m)));
});

test('ingest: network error then success', async () => {
  const r = recorder();
  const fetchImpl = seq([new TypeError('fetch failed'), res(200, '{"commentMarkdown":"ok"}')]);
  const out = await ingest(fetchImpl, r);
  assert.equal(out.status, 200);
  assert.match(r.warnings[0], /network error: fetch failed/);
});

test('ingest: timeout is retried', async () => {
  const r = recorder();
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  const fetchImpl = seq([timeout, res(200, '{"commentMarkdown":"ok"}')]);
  await ingest(fetchImpl, r);
  assert.match(r.warnings[0], /timeout after 90s/);
  assert.ok(fetchImpl.calls[0].init.signal, 'each attempt gets an abort signal');
});

test('ingest: 4xx is not retried', async () => {
  for (const status of [400, 401, 404, 413]) {
    const r = recorder();
    const fetchImpl = seq([res(status, '{"error":"nope"}')]);
    const out = await ingest(fetchImpl, r);
    assert.equal(out.status, status);
    assert.equal(fetchImpl.calls.length, 1);
    assert.deepEqual(r.sleeps, []);
  }
});

test('ingest: 429 honours Retry-After (seconds), capped at the maximum', async () => {
  const r = recorder();
  const fetchImpl = seq([res(429, '', { 'Retry-After': '7' }), res(429, '', { 'Retry-After': '3600' }), res(200, '{"commentMarkdown":"ok"}')]);
  const out = await ingest(fetchImpl, r);
  assert.equal(out.status, 200);
  assert.deepEqual(r.sleeps, [7000, MAX_RETRY_AFTER_MS]);
});

test('ingest: all attempts fail -> throws a clear error with backoff 2s/5s/12s', async () => {
  const r = recorder();
  const fetchImpl = seq([res(503, '<html>Service Unavailable</html>')]);
  await assert.rejects(ingest(fetchImpl, r), /Muzo Guard ingest failed after 4 attempts \(last: HTTP 503 <html>Service Unavailable<\/html>\)\. The PR event was not recorded; re-run this job/);
  assert.equal(fetchImpl.calls.length, 4);
  assert.deepEqual(r.sleeps, [2000, 5000, 12000]);
  assert.equal(r.warnings.length, 3);
});

test('jitter stays within ±25% of the base delay', async () => {
  for (const [r, expected] of [[0, [1500, 3750, 9000]], [1, [2500, 6250, 15000]]]) {
    const sleeps = [];
    await assert.rejects(fetchWithRetry({ url: 'u', fetchImpl: seq([res(500)]), sleep: async (ms) => sleeps.push(ms), log: () => {}, random: () => r }));
    assert.deepEqual(sleeps, expected);
  }
});

test('isRetryableStatus and parseRetryAfter', () => {
  assert.deepEqual([200, 301, 400, 401, 404, 413, 429, 500, 502, 503, 504].map(isRetryableStatus),
    [false, false, false, false, false, false, true, true, true, true, true]);
  assert.equal(parseRetryAfter('5'), 5000);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter('soon'), null);
  const now = Date.parse('2026-01-01T00:00:00Z');
  assert.equal(parseRetryAfter('Thu, 01 Jan 2026 00:00:10 GMT', now), 10000);
});
