'use strict';
const { MAX_LISTED_COMMITS } = require('./mergeDiff');

/**
 * Unieke, lowercase e-mailadressen van de commit-auteurs van de PR (merge-commits uitgezonderd).
 * undefined = onbekend (commits niet op te halen of afgekapt door de paginatie-cap); [] = geen werk-commits.
 */
function collectCommitAuthorEmails(commits, commitsOk) {
  if (!commitsOk || commits.length >= MAX_LISTED_COMMITS) return undefined;
  const seen = new Set();
  for (const c of commits) {
    if ((c.parents || []).length >= 2) continue;
    const email = c.commit && c.commit.author && c.commit.author.email;
    if (typeof email !== 'string') continue;
    const normalized = email.trim().toLowerCase();
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

module.exports = { collectCommitAuthorEmails };
