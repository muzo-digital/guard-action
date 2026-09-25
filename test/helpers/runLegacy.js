'use strict';
const legacyCollect = require('../fixtures/legacyCollect');
const { makeFakeGithub } = require('./fakeGithub');

/** Draait het legacy-script en vangt wat het naar /tmp/qg-payload.json zou schrijven. */
async function runLegacy(fixture, context) {
  let written = null;
  const fakeRequire = (name) => {
    if (name !== 'fs') throw new Error(`unexpected require ${name}`);
    return { writeFileSync: (_path, data) => { written = data; } };
  };
  const originalLog = console.log;
  console.log = () => {};
  try {
    await legacyCollect({ github: makeFakeGithub(fixture), context, require: fakeRequire });
  } finally {
    console.log = originalLog;
  }
  return written;
}

module.exports = { runLegacy };
