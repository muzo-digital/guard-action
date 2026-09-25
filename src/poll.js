'use strict';
const { VERSION } = require('./version');
const { ingestEndpoint } = require('./ingest');

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wacht op de security-analyse (standaard 12 × 20s ≈ 4 min). Faalt nooit: bij opgeven komt er null terug. */
async function pollAnalysis({
  ingestUrl,
  token,
  context,
  fetchImpl = fetch,
  sleep = defaultSleep,
  intervalMs = 20000,
  maxAttempts = 12,
  log = console.log,
}) {
  const params = new URLSearchParams({
    repoOwner: context.repo.owner,
    repoName: context.repo.repo,
    prNumber: String(context.payload.pull_request.number),
  });
  const url = `${ingestEndpoint(ingestUrl, '/api/ingest/pr/analysis')}?${params}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(intervalMs);
    try {
      const res = await fetchImpl(url, { headers: { 'x-qg-token': token, 'x-guard-action-version': VERSION } });
      if (!res.ok) {
        log(`Poll attempt ${attempt}: HTTP ${res.status} — giving up.`);
        return null;
      }
      const body = await res.json();
      if (body.ready) return body.commentMarkdown || null;
      log(`Poll attempt ${attempt}: analysis still running…`);
    } catch (error) {
      log(`Poll attempt ${attempt} failed: ${error.message}`);
    }
  }
  return null;
}

module.exports = { pollAnalysis };
