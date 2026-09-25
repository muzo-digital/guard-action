'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { upsertComment, findBotComment } = require('../src/comment');
const { makeFakeGithub, makeContext } = require('./helpers/fakeGithub');

const human = (i) => ({ id: i, body: `comment ${i}`, user: { type: 'User' } });

test('updates the existing bot comment even beyond the first 30 comments', async () => {
  const comments = [...Array.from({ length: 35 }, (_, i) => human(i)), { id: 99, body: '## Muzo Build\nold', user: { type: 'Bot' } }];
  const github = makeFakeGithub({ comments });
  const result = await upsertComment({ github, context: makeContext(), body: 'new' });
  assert.equal(result, 'updated');
  assert.deepEqual(github.calls.find(([n]) => n === 'issues.listComments')[1].per_page, 100);
  assert.equal(github.calls.find(([n]) => n === 'issues.updateComment')[1].comment_id, 99);
  assert.equal(github.calls.some(([n]) => n === 'issues.createComment'), false);
});

test('creates a comment when no bot comment exists', async () => {
  const github = makeFakeGithub({ comments: [{ id: 1, body: 'Muzo Guard mentioned by a human', user: { type: 'User' } }] });
  assert.equal(await upsertComment({ github, context: makeContext(), body: 'new' }), 'created');
  assert.equal(github.calls.find(([n]) => n === 'issues.createComment')[1].issue_number, 42);
});

test('findBotComment ignores comments with a null body', () => {
  assert.equal(findBotComment([{ id: 1, body: null, user: { type: 'Bot' } }]), undefined);
});
