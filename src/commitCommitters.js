'use strict';
const { MAX_LISTED_COMMITS } = require('./mergeDiff');

// "Update with rebase" op GitHub zet de committer op dit adres; dat is geen persoon.
const GITHUB_NOREPLY = 'noreply@github.com';

/**
 * Unieke, lowercase e-mailadressen van de committers van de PR (merge-commits en noreply@github.com uitgezonderd).
 * De auteur is voor freelancers altijd app@muzo.digital (Vercel eist dat); de committer is het persoonlijke adres.
 * undefined = onbekend (commits niet op te halen of afgekapt door de paginatie-cap); [] = geen werk-commits.
 */
function collectCommitCommitterEmails(commits, commitsOk) {
  if (!commitsOk || commits.length >= MAX_LISTED_COMMITS) return undefined;
  const seen = new Set();
  for (const c of commits) {
    if ((c.parents || []).length >= 2) continue;
    const email = c.commit && c.commit.committer && c.commit.committer.email;
    if (typeof email !== 'string') continue;
    const normalized = email.trim().toLowerCase();
    if (normalized && normalized !== GITHUB_NOREPLY) seen.add(normalized);
  }
  return [...seen];
}

module.exports = { collectCommitCommitterEmails };
