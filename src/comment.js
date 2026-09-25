'use strict';

const MARKERS = ['Muzo Guard', 'Muzo Build'];

function findBotComment(comments) {
  return comments.find(
    (c) => typeof c.body === 'string' && MARKERS.some((m) => c.body.includes(m)) && c.user && c.user.type === 'Bot'
  );
}

/**
 * Werkt de bestaande bot-comment bij of maakt er een. Gepagineerd: de
 * legacy-workflow las alleen de eerste 30 comments, waardoor een drukke PR een
 * tweede Guard-comment kreeg.
 */
async function upsertComment({ github, context, body }) {
  const { owner, repo } = context.repo;
  const issue_number = context.payload.pull_request.number;
  const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number, per_page: 100 });
  const existing = findBotComment(comments);
  if (existing) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    return 'updated';
  }
  await github.rest.issues.createComment({ owner, repo, issue_number, body });
  return 'created';
}

module.exports = { upsertComment, findBotComment };
