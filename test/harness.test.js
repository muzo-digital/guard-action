'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const { VERSION } = require('../src/version');
const { makeContext } = require('./helpers/fakeGithub');
const { runLegacy } = require('./helpers/runLegacy');
const { PR_FIXTURE } = require('./fixtures/prFixture');

test('VERSION in src/version.js equals package.json version', () => {
  assert.equal(VERSION, pkg.version);
});

test('legacy script runs against the fake and writes a payload', async () => {
  const written = await runLegacy(PR_FIXTURE, makeContext());
  const payload = JSON.parse(written);
  assert.equal(payload.prNumber, 42);
  assert.equal(payload.filesWithDiff.length, 6);
});
