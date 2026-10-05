'use strict';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wachttijden tussen pogingen: 4 pogingen in totaal (~2s, ~5s, ~12s ertussen). */
const DEFAULT_DELAYS_MS = [2000, 5000, 12000];
/** Een Retry-After van de server wordt gevolgd, maar nooit langer dan dit. */
const MAX_RETRY_AFTER_MS = 30000;
/** Per poging; de route antwoordt normaal binnen seconden (de analyse loopt via after()). */
const DEFAULT_TIMEOUT_MS = 90000;

/** 5xx en 429 zijn tijdelijk; overige 4xx (auth, validatie, 413) worden niet beter door te herhalen. */
function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

/** Retry-After als seconden of HTTP-datum, in ms; null als afwezig of onleesbaar. */
function parseRetryAfter(value, now = Date.now()) {
  if (value == null || value === '') return null;
  const trimmed = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

function readHeader(res, name) {
  const headers = res && res.headers;
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

/** Backoff met ±25% jitter, of de Retry-After van de server (begrensd). */
function delayFor({ attempt, res, delaysMs, random, maxRetryAfterMs }) {
  const retryAfter = res ? parseRetryAfter(readHeader(res, 'retry-after')) : null;
  if (retryAfter != null) return Math.min(retryAfter, maxRetryAfterMs);
  const base = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
  return Math.round(base * (0.75 + random() * 0.5));
}

/**
 * fetch met nieuwe pogingen bij netwerkfouten, timeouts, 5xx en 429. `read(res)` leest de body binnen
 * dezelfde poging, zodat een afgebroken stream ook opnieuw geprobeerd wordt. Geeft het eerste
 * niet-herhaalbare antwoord terug (2xx/3xx/4xx); gooit na de laatste mislukte poging.
 */
async function fetchWithRetry({
  url,
  init = {},
  fetchImpl = fetch,
  read = async (res) => res,
  label = 'Request',
  sleep = defaultSleep,
  log = console.log,
  warn = log,
  delaysMs = DEFAULT_DELAYS_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetryAfterMs = MAX_RETRY_AFTER_MS,
  random = Math.random,
}) {
  const maxAttempts = delaysMs.length + 1;
  let lastProblem = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res = null;
    try {
      const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
      res = await fetchImpl(url, { ...init, ...(signal ? { signal } : {}) });
      const result = await read(res);
      if (!isRetryableStatus(res.status)) {
        if (attempt > 1) log(`${label}: attempt ${attempt}/${maxAttempts} succeeded with HTTP ${res.status}.`);
        return result;
      }
      const snippet = result && typeof result.raw === 'string' ? result.raw.slice(0, 200).trim() : '';
      lastProblem = `HTTP ${res.status}${snippet ? ` ${snippet}` : ''}`;
    } catch (error) {
      const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      lastProblem = timedOut ? `timeout after ${timeoutMs / 1000}s` : `network error: ${error && error.message}`;
    }
    if (attempt === maxAttempts) break;
    const waitMs = delayFor({ attempt, res, delaysMs, random, maxRetryAfterMs });
    warn(`${label}: attempt ${attempt}/${maxAttempts} failed (${lastProblem}); retrying in ${(waitMs / 1000).toFixed(1)}s.`);
    await sleep(waitMs);
  }
  throw new Error(`${label} failed after ${maxAttempts} attempts (last: ${lastProblem}).`);
}

module.exports = { fetchWithRetry, isRetryableStatus, parseRetryAfter, DEFAULT_DELAYS_MS, MAX_RETRY_AFTER_MS, DEFAULT_TIMEOUT_MS };
