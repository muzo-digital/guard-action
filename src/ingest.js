'use strict';
const { VERSION } = require('./version');
const { fetchWithRetry } = require('./retry');

function ingestEndpoint(ingestUrl, path) {
  return ingestUrl.replace(/\/+$/, '') + path;
}

/**
 * POST het payload. Geeft de ruwe tekst terug zodat een niet-JSON-antwoord (502, HTML) in de log zichtbaar blijft.
 * Netwerkfouten, timeouts, 5xx en 429 worden opnieuw geprobeerd (de server is idempotent op herlevering);
 * na de laatste mislukte poging gooit dit, zodat de job rood wordt in plaats van een merge stil te verliezen.
 */
async function postIngest({ ingestUrl, token, payload, fetchImpl = fetch, sleep, log = console.log, warn, retry = {} }) {
  const url = ingestEndpoint(ingestUrl, '/api/ingest/pr');
  const init = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-qg-token': token,
      'x-guard-action-version': VERSION,
    },
    body: JSON.stringify(payload),
  };
  const read = async (res) => {
    const raw = await res.text();
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    return { status: res.status, body, raw };
  };
  try {
    return await fetchWithRetry({ url, init, fetchImpl, read, label: 'Muzo Guard ingest', log, warn: warn || log, ...(sleep ? { sleep } : {}), ...retry });
  } catch (error) {
    throw new Error(`${error.message} The PR event was not recorded; re-run this job to send it again.`);
  }
}

module.exports = { postIngest, ingestEndpoint };
