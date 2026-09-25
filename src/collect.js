'use strict';

// Zelfde lijst en limieten als de workflow vóór guard-action: alle
// filterlogica woont aan de serverkant, dit slaat alleen de inhoud over van
// bestanden die nooit nuttig zijn en heel groot kunnen zijn.
const SKIP_CONTENT_PATTERNS = [
  /node_modules\//,
  /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb)$/,
];
const MAX_FILE_SIZE = 100000; // 100KB per bestand
const MAX_TOTAL_CONTENT = 500000; // 500KB totaal

async function collectPayload({ github, context, log = console.log }) {
  const { owner, repo } = context.repo;
  const pull = context.payload.pull_request;

  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: pull.number });

  const files = await github.paginate(github.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pull.number,
    per_page: 100,
  });

  const filesWithDiff = files.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch || '',
  }));

  let totalContentSize = 0;
  const headSha = pull.head.sha;
  for (const file of filesWithDiff) {
    if (file.status === 'removed') continue;
    if (SKIP_CONTENT_PATTERNS.some((p) => p.test(file.filename))) continue;
    if (totalContentSize >= MAX_TOTAL_CONTENT) break;
    try {
      const { data: fileData } = await github.rest.repos.getContent({ owner, repo, path: file.filename, ref: headSha });
      if (Array.isArray(fileData) || !fileData.content) continue;
      if (fileData.size > MAX_FILE_SIZE) continue;
      const decoded = Buffer.from(fileData.content, 'base64').toString('utf-8');
      if (decoded.includes('\0')) continue;
      if (totalContentSize + decoded.length <= MAX_TOTAL_CONTENT) {
        file.content = decoded;
        totalContentSize += decoded.length;
      }
    } catch (err) {
      log(`Could not fetch content for ${file.filename}: ${err.message}`);
    }
  }

  let commits = [];
  let commitsOk = true;
  let commitMessages = [];
  try {
    commits = await github.paginate(github.rest.pulls.listCommits, {
      owner,
      repo,
      pull_number: pull.number,
      per_page: 100,
    });
    commitMessages = commits.map((c) => c.commit.message).slice(0, 50);
  } catch (err) {
    commitsOk = false;
    log('Could not fetch commit messages:', err.message);
  }

  const payload = {
    repoOwner: owner,
    repoName: repo,
    prNumber: pull.number,
    prTitle: pull.title,
    prBody: (pr.body || '').slice(0, 5000),
    commitMessages,
    headSha: pull.head.sha,
    headBranch: pull.head.ref,
    baseBranch: pull.base.ref,
    additions: pr.additions,
    deletions: pr.deletions,
    files: files.map((f) => f.filename),
    filesWithDiff,
    action: context.payload.action,
    merged: pull.merged || false,
    labels: pull.labels.map((l) => l.name),
    prAuthor: pull.user.login,
  };

  return { payload, commits, commitsOk };
}

module.exports = { collectPayload };
