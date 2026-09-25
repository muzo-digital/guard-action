'use strict';
const { collectPayload } = require('./collect');
const { collectMergeDiff } = require('./mergeDiff');
const { postIngest, ingestEndpoint } = require('./ingest');
const { upsertComment } = require('./comment');
const { pollAnalysis } = require('./poll');

const DEFAULT_INGEST_URL = 'https://portal.muzo.digital';
// Vercel weigert request bodies boven 4,5 MB nog vóór de route draait; dan gaat de merge verloren.
const MAX_BODY_BYTES = 4_000_000;

async function run({ github, context, core, env = process.env, fetchImpl = fetch, sleep, log = console.log, maxBodyBytes = MAX_BODY_BYTES }) {
  const token = env.QG_TOKEN;
  if (!token) {
    throw new Error(
      'Het secret QG_INGEST_TOKEN is leeg. Voeg het toe onder Settings → Secrets and variables → Actions. ' +
        'PR\'s vanuit een fork krijgen geen secrets; die worden niet door Muzo Guard verwerkt.'
    );
  }
  core.setSecret(token);
  const ingestUrl = env.QG_INGEST_URL || DEFAULT_INGEST_URL;

  const { payload, commits, commitsOk } = await collectPayload({ github, context, log });

  if (context.payload.action === 'closed' && payload.merged) {
    payload.mergeDiff = await collectMergeDiff({ github, context, commits, commitsOk });
    // Het closed-pad van de server leest geen files; de inhoud eruit houdt de
    // body ruim onder de limiet nu de merge-diff erbij komt.
    // Ook de patches: het closed-pad leest ze niet, additions/deletions blijven staan.
    for (const file of payload.filesWithDiff) {
      delete file.content;
      file.patch = '';
    }
    const bodyBytes = Buffer.byteLength(JSON.stringify(payload));
    if (bodyBytes > maxBodyBytes) {
      payload.mergeDiff = { error: 'body_too_large' };
      log(`Merge diff dropped: body of ${bodyBytes} bytes exceeds ${maxBodyBytes} (body_too_large)`);
    }
    if (payload.mergeDiff.error) log(`Merge diff unavailable: ${payload.mergeDiff.error}`);
  }

  log(`Calling: ${ingestEndpoint(ingestUrl, '/api/ingest/pr')}`);
  const response = await postIngest({ ingestUrl, token, payload, fetchImpl });
  log(`Raw response: HTTP ${response.status} ${response.raw}`);

  const initial = response.body;
  if (!initial || !initial.commentMarkdown) {
    throw new Error('Missing commentMarkdown in API response');
  }
  await upsertComment({ github, context, body: initial.commentMarkdown });

  const shouldPoll =
    env.QG_POLL !== 'false' &&
    context.payload.action !== 'closed' &&
    Boolean(initial.pullRequestId) &&
    initial.status !== 'skipped';
  if (!shouldPoll) {
    log('PR not tracked, skipped or closed — nothing to poll for.');
    return;
  }

  // Pollen mag de job nooit laten falen: de volgende push of de merge vult de comment alsnog aan.
  try {
    const markdown = await pollAnalysis({ ingestUrl, token, context, fetchImpl, ...(sleep ? { sleep } : {}), log });
    if (!markdown) {
      log('Analysis not finished within the polling window — the comment will be updated on the next push or merge.');
      return;
    }
    await upsertComment({ github, context, body: markdown });
  } catch (error) {
    log(`Updating the comment with the analysis failed: ${error.message}`);
  }
}

module.exports = { run, DEFAULT_INGEST_URL, MAX_BODY_BYTES };
