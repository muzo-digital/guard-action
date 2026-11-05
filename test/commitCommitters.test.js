'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectCommitCommitterEmails } = require('../src/commitCommitters');

const commit = (committer, parents = [{}], author = 'app@muzo.digital') => ({
  parents,
  commit: { author: { email: author }, committer: { email: committer } },
});

test('reads the committer, not the author', () => {
  assert.deepEqual(collectCommitCommitterEmails([commit('Y@X.nl ')], true), ['y@x.nl']);
});

test('same committer in different casing gives one address', () => {
  assert.deepEqual(collectCommitCommitterEmails([commit('Y@X.nl'), commit('y@x.nl '), commit('z@x.nl')], true), ['y@x.nl', 'z@x.nl']);
});

test('merge commits are left out', () => {
  assert.deepEqual(collectCommitCommitterEmails([commit('a@x.nl'), commit('b@x.nl', [{}, {}])], true), ['a@x.nl']);
});

test('only merge commits gives an empty list', () => {
  assert.deepEqual(collectCommitCommitterEmails([commit('b@x.nl', [{}, {}])], true), []);
});

test('committer noreply@github.com is left out', () => {
  assert.deepEqual(collectCommitCommitterEmails([commit('NoReply@GitHub.com'), commit('a@x.nl')], true), ['a@x.nl']);
});

test('only noreply@github.com committers gives an empty list', () => {
  assert.deepEqual(collectCommitCommitterEmails([commit('noreply@github.com')], true), []);
});

test('commitsOk=false gives undefined', () => {
  assert.equal(collectCommitCommitterEmails([commit('a@x.nl')], false), undefined);
});

test('250 commits (paginate cap) gives undefined', () => {
  const commits = Array.from({ length: 250 }, () => commit('a@x.nl'));
  assert.equal(collectCommitCommitterEmails(commits, true), undefined);
});

test('commits without commit.committer or email are skipped', () => {
  assert.deepEqual(collectCommitCommitterEmails([{ commit: {} }, { parents: [] }, { commit: { author: { email: 'q@x.nl' } } }, commit('  '), commit('a@x.nl')], true), ['a@x.nl']);
});
