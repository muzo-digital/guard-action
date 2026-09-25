'use strict';
const { VERSION } = require('./version');

function ingestEndpoint(ingestUrl, path) {
  return ingestUrl.replace(/\/+$/, '') + path;
}

/** POST het payload. Geeft de ruwe tekst terug zodat een niet-JSON-antwoord (502, HTML) in de log zichtbaar blijft. */
async function postIngest({ ingestUrl, token, payload, fetchImpl = fetch }) {
  const res = await fetchImpl(ingestEndpoint(ingestUrl, '/api/ingest/pr'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-qg-token': token,
      'x-guard-action-version': VERSION,
    },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  return { status: res.status, body, raw };
}

module.exports = { postIngest, ingestEndpoint };
