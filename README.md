# botanary-contract

Botanary on-chain escrow contracts. Solidity, built and tested with Hardhat.

## How this repository is built and deployed

It isn't, here. This repo declares *what it is* in [`.platform.yml`](.platform.yml);
[`devsecops-playground-org/platform`](https://github.com/devsecops-playground-org/platform)
decides what to do with it. `.github/workflows/ci.yml` is the same twelve lines
found in every repo in the organisation.

```
security gate  →  test  →  build · scan · sign  →  deploy
```

| you push to | what happens |
|---|---|
| a branch or pull request | security gate + tests, no deploy |
| `deploy/staging` | full pipeline, deploys to **staging** |
| `deploy/prod` | full pipeline, deploys to **production** after approval |

## Local development

```bash
cp .env.example .env      # fill in real values; .env is git-ignored and scanned for
pre-commit install        # refuses any commit containing a secret
docker compose up
```

## Secrets

Nothing sensitive belongs in this repository. Runtime configuration is documented
in `.env.example` with placeholder values only. Deploy credentials live in the
repository's **staging** and **production** GitHub Environments; application
secrets come from the secrets manager at deploy time.
