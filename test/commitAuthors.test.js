'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectCommitAuthorEmails } = require('../src/commitAuthors');

const commit = (email, parents = [{}]) => ({ parents, commit: { author: { email } } });

test('lowercases, trims and de-duplicates in first-seen order', () => {
  assert.deepEqual(collectCommitAuthorEmails([commit('Y@X.nl'), commit('y@x.nl '), commit('z@x.nl')], true), ['y@x.nl', 'z@x.nl']);
});

test('merge commits are left out', () => {
  assert.deepEqual(collectCommitAuthorEmails([commit('a@x.nl'), commit('app@muzo.digital', [{}, {}])], true), ['a@x.nl']);
});

test('only merge commits gives an empty list', () => {
  assert.deepEqual(collectCommitAuthorEmails([commit('app@muzo.digital', [{}, {}])], true), []);
});

test('commitsOk=false gives undefined', () => {
  assert.equal(collectCommitAuthorEmails([commit('a@x.nl')], false), undefined);
});

test('250 commits (paginate cap) gives undefined', () => {
  const commits = Array.from({ length: 250 }, () => commit('a@x.nl'));
  assert.equal(collectCommitAuthorEmails(commits, true), undefined);
});

test('commits without commit.author or email are skipped', () => {
  assert.deepEqual(collectCommitAuthorEmails([{ commit: {} }, { parents: [] }, commit('  '), commit('a@x.nl')], true), ['a@x.nl']);
});
