# PR Review Bot

AI-powered code review for GitHub Pull Requests.

## Features

- **Logic Review**: Check for bugs, edge cases, error handling
- **Security Review**: Detect vulnerabilities, injection risks, sensitive data exposure
- **Style Review**: Code style, naming conventions, best practices

## Usage

### As GitHub Action

1. Create `.github/workflows/pr-review.yml` in your repository:

```yaml
name: PR Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: jingjing20/pr-review-bot@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

2. Add `OPENAI_API_KEY` to your repository secrets.

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | Yes | - | GitHub token for API access |
| `openai-api-key` | Yes | - | OpenAI API key |
| `openai-base-url` | No | - | Custom OpenAI API base URL |
| `openai-model` | No | `gpt-4o-mini` | Model to use |
| `agents` | No | `logic,security,style` | Agents to run |
| `post-comment` | No | `true` | Post review as PR comment |

### Outputs

| Output | Description |
|--------|-------------|
| `total-issues` | Total number of issues found |
| `errors` | Number of errors |
| `warnings` | Number of warnings |

### As CLI Tool

```bash
# Install
pnpm install

# Run
pnpm start review https://github.com/owner/repo/pull/123
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build action
pnpm build
```

## Publishing

1. Build the action:
   ```bash
   pnpm build
   ```

2. Commit `dist/action` directory

3. Create a release tag:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```

4. Create a major version tag for easy reference:
   ```bash
   git tag -fa v1 -m "Update v1 tag"
   git push origin v1 --force
   ```

## License

MIT
