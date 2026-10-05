# Muzo Guard Action

GitHub Action for submitting pull request metadata to Muzo Guard for quality analysis.

## Usage

Add this workflow to your repository as `.github/workflows/muzo-guard.yml`:

```yaml
name: Muzo Guard

on:
  pull_request:
    types: [opened, synchronize, reopened, closed, labeled, unlabeled]

permissions:
  pull-requests: write
  contents: read

jobs:
  muzo-guard:
    runs-on: ubuntu-latest
    steps:
      - name: Muzo Guard
        uses: muzo-digital/guard-action@v1
        with:
          token: ${{ secrets.QG_INGEST_TOKEN }}
```

The token comes from the setup link Muzo sends you. Store it as the repository secret `QG_INGEST_TOKEN`.

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `token` | The repository's Muzo Guard ingest token (from the setup link Muzo sends) | Yes | |
| `ingest-url` | Muzo Guard base URL | No | `https://portal.muzo.digital` |
| `poll-analysis` | Wait for the security analysis and update the PR comment (`true`/`false`) | No | `true` |

## Versioning

- Use `@v1` to track the latest v1 release (recommended for most users)
- Pin to a specific commit if you prefer explicit control:

  ```yaml
  uses: muzo-digital/guard-action@<sha> # v1.0.0
  ```

  The trailing version comment lets Dependabot update the pin.

Dependabot can automatically update your action version with the `github-actions` package ecosystem.

## Troubleshooting

- Does your organization restrict which Actions may run (Settings → Actions → General → "Allow select actions")? Add `muzo-digital/guard-action@*` to the allowlist, otherwise the workflow cannot start.

- Temporary Muzo Guard outages (network errors, timeouts, HTTP 5xx or 429) are retried automatically: 4 attempts with backoff (~2s, ~5s, ~12s, honouring `Retry-After` up to 30s). If every attempt fails, the job fails; re-run it to send the PR event again. Other 4xx responses (invalid token, unknown repo) are not retried.

## License

See [LICENSE](LICENSE) for details. This source is published so customers can audit the code running in their repositories.
