'use strict';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

const PR_FIXTURE = {
  pr: { body: 'Adds the widget.\n'.repeat(400), additions: 120, deletions: 8 }, // body > 5000 → wordt afgekapt
  files: [
    { filename: 'src/widget.ts', status: 'added', additions: 100, deletions: 0, patch: '@@ -0,0 +1 @@\n+export const w = 1;' },
    { filename: 'src/old.ts', status: 'removed', additions: 0, deletions: 8, patch: '@@ -1 +0,0 @@\n-old' },
    { filename: 'package-lock.json', status: 'modified', additions: 10, deletions: 0, patch: '@@' },
    { filename: 'assets/logo.bin', status: 'added', additions: 0, deletions: 0 }, // geen patch-veld
    { filename: 'src/big.ts', status: 'modified', additions: 5, deletions: 0, patch: '@@' },
    { filename: 'src/missing.ts', status: 'modified', additions: 5, deletions: 0, patch: '@@' },
  ],
  contents: {
    'src/widget.ts': { content: b64('export const w = 1;\n'), size: 20 },
    'assets/logo.bin': { content: b64('PNG\0\0data'), size: 10 },
    'src/big.ts': { content: b64('x'), size: 200000 },
    // src/missing.ts ontbreekt bewust → getContent gooit → gelogd, overgeslagen
  },
  commits: [
    { sha: 'c1', commit: { message: 'feat: widget skeleton' } },
    { sha: 'c2', commit: { message: 'feat: widget styles' } },
  ],
};

module.exports = { PR_FIXTURE };
