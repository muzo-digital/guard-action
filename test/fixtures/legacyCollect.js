// GEGENEREERD uit quality-guard .github/workflows/muzo.yml (stap "Get PR details") vóór de migratie naar guard-action.
// Niet met de hand aanpassen: dit is de referentie voor de pariteitstest.
module.exports = async function legacyCollect({ github, context, require }) {
const { data: pr } = await github.rest.pulls.get({
  owner: context.repo.owner,
  repo: context.repo.repo,
  pull_number: context.payload.pull_request.number,
});

// Fetch all files with pagination (handles PRs with >100 files)
const files = await github.paginate(
  github.rest.pulls.listFiles,
  {
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request.number,
    per_page: 100,
  }
);

// Map all files with diff data (server handles exclusion logic)
const filesWithDiff = files.map(f => ({
  filename: f.filename,
  status: f.status,
  additions: f.additions,
  deletions: f.deletions,
  patch: f.patch || '',
}));

// Fetch file contents for AI context (non-removed files only)
// Minimal stable exclusion: only skip content fetch for files that are
// never useful and can be very large. All filtering logic lives server-side.
const skipContentPatterns = [
  /node_modules\//,
  /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb)$/,
];

const MAX_FILE_SIZE = 100000; // 100KB per file
const MAX_TOTAL_CONTENT = 500000; // 500KB total
let totalContentSize = 0;
const headSha = context.payload.pull_request.head.sha;

for (const file of filesWithDiff) {
  if (file.status === 'removed') continue;
  if (skipContentPatterns.some(p => p.test(file.filename))) continue;
  if (totalContentSize >= MAX_TOTAL_CONTENT) break;

  try {
    const { data: fileData } = await github.rest.repos.getContent({
      owner: context.repo.owner,
      repo: context.repo.repo,
      path: file.filename,
      ref: headSha,
    });

    if (Array.isArray(fileData) || !fileData.content) continue;
    if (fileData.size > MAX_FILE_SIZE) continue;

    const decoded = Buffer.from(fileData.content, 'base64').toString('utf-8');
    if (decoded.includes('\0')) continue;

    if (totalContentSize + decoded.length <= MAX_TOTAL_CONTENT) {
      file.content = decoded;
      totalContentSize += decoded.length;
    }
  } catch (err) {
    console.log(`Could not fetch content for ${file.filename}: ${err.message}`);
  }
}

// Get commit messages via GitHub API
let commitMessages = [];
try {
  const commits = await github.paginate(
    github.rest.pulls.listCommits,
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
      per_page: 100,
    }
  );
  commitMessages = commits.map(c => c.commit.message).slice(0, 50);
} catch (err) {
  console.log('Could not fetch commit messages:', err.message);
}

// Send all data — server handles all business logic
const payload = {
  repoOwner: context.repo.owner,
  repoName: context.repo.repo,
  prNumber: context.payload.pull_request.number,
  prTitle: context.payload.pull_request.title,
  prBody: (pr.body || '').slice(0, 5000),
  commitMessages,
  headSha: context.payload.pull_request.head.sha,
  // Branches: nodig om een release (develop -> acceptatie -> main)
  // te herkennen, die tegen een vast tarief gaat in plaats van
  // opnieuw per regel.
  headBranch: context.payload.pull_request.head.ref,
  baseBranch: context.payload.pull_request.base.ref,
  additions: pr.additions,
  deletions: pr.deletions,
  files: files.map(f => f.filename),
  filesWithDiff,
  action: context.payload.action,
  merged: context.payload.pull_request.merged || false,
  labels: context.payload.pull_request.labels.map(l => l.name),
  prAuthor: context.payload.pull_request.user.login,
};

const fs = require('fs');
fs.writeFileSync('/tmp/qg-payload.json', JSON.stringify(payload));

};
