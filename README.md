# Muzo Guard Action

GitHub Action for submitting pull request metadata to Muzo Guard for quality analysis.

## Usage

Add this to your GitHub Actions workflow:

```yaml
- name: Muzo Guard
  uses: muzo-digital/guard-action@v1
  with:
    token: ${{ secrets.QG_INGEST_TOKEN }}
```

## Inputs

| Input | Description | Required |
|-------|-------------|----------|
| `token` | Muzo Guard ingest token (create in portal.muzo.digital) | Yes |

## Versioning

- Use `@v1` to track the latest v1 release (recommended for most users)
- Use `@<commit-sha>` to pin to a specific commit if you prefer explicit control

Dependabot can automatically update your action version with the `github-actions` package ecosystem.

## License

See [LICENSE](LICENSE) for details. This source is published so customers can audit the code running in their repositories.
