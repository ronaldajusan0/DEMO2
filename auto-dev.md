# auto-dev.md — Automated Development Workflow

This document defines the automated loop that turns a GitHub issue into a
reviewed, merged pull request with minimal human intervention. It ties together
[SPEC.md](SPEC.md), [agent.md](agent.md), and [sprint.md](sprint.md).

## The Loop

```
select issue → branch → implement → test → open PR → CI + review → merge → close
      ↑                                                                      │
      └──────────────────────── next issue ─────────────────────────────────┘
```

1. **Select** the highest-priority `ready` issue not blocked by others.
2. **Branch** from `main`: `feat/<issue-#>-<slug>`.
3. **Implement** per the issue's acceptance criteria and agent.md conventions.
4. **Test** — add/update tests; run lint, typecheck, and the test suite.
5. **Open PR** — link the issue (`Closes #<n>`), fill the PR template.
6. **CI** runs; if red, the agent fixes and pushes until green.
7. **Review** — human (or review agent) approves.
8. **Merge** (squash) → issue auto-closes → pick next.

## Trigger Options

Pick one to drive the loop:

- **Manual per issue:** run `scripts/auto-dev.sh <issue-#>`.
- **Label-driven:** GitHub Action fires when an issue gets the `agent-ready` label.
- **Scheduled:** a cron picks the next ready issue each interval.

## Selecting the Next Issue

```bash
# Highest-priority open issue labeled agent-ready, not blocked
gh issue list --label agent-ready --state open \
  --json number,title,labels --jq '.[0].number'
```

Skip issues labeled `blocked` or `needs-human`.

## Local Automation Script (reference)

```bash
#!/usr/bin/env bash
# scripts/auto-dev.sh <issue-number>
set -euo pipefail
ISSUE="$1"

TITLE=$(gh issue view "$ISSUE" --json title --jq .title)
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/-*$//')
BRANCH="feat/${ISSUE}-${SLUG}"

git checkout main && git pull
git checkout -b "$BRANCH"

# --- agent implements changes here ---
# (invoke the coding agent with the issue body as the task)

# Gates
npm --prefix backend run lint
npm --prefix backend run test
npm --prefix frontend run lint
npm --prefix frontend run test

git add -A
git commit -m "feat: ${TITLE} (#${ISSUE})"
git push -u origin "$BRANCH"

gh pr create \
  --title "${TITLE} (#${ISSUE})" \
  --body "Closes #${ISSUE}" \
  --base main --head "$BRANCH"
```

## CI Gates (GitHub Actions)

`.github/workflows/ci.yml` must pass before merge:

- Install deps.
- Lint (ESLint) + typecheck (`tsc --noEmit`).
- Unit + integration tests.
- Build.

```yaml
name: ci
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres }
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci --prefix backend && npm ci --prefix frontend
      - run: npm --prefix backend run lint && npm --prefix backend run typecheck
      - run: npm --prefix backend run test
      - run: npm --prefix frontend run lint && npm --prefix frontend run test
      - run: npm --prefix frontend run build
```

## Optional: Agent-in-CI

A workflow can run the coding agent automatically when an issue is labeled:

```yaml
name: auto-dev
on:
  issues:
    types: [labeled]
jobs:
  build:
    if: github.event.label.name == 'agent-ready'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # invoke coding agent with ${{ github.event.issue.number }}
      # agent branches, implements, and opens a PR
```

## Guardrails (must hold)

- Agent **never merges its own PR** without a passing CI run.
- Human approval required for: schema migrations, auth/PII code, dependency
  additions. These issues carry `needs-human` and are skipped by the auto loop.
- No secrets in code or logs.
- Failing tests are fixed, never deleted or skipped, to go green.
- One issue per PR; revert cleanly if a change regresses `main`.

## Metrics to Watch
- Cycle time: issue `ready` → merged.
- CI pass rate on first push.
- PR revert rate.
- Test coverage trend.

## Cross-References
- What to build: [SPEC.md](SPEC.md)
- How to build it: [agent.md](agent.md)
- What to build now: [sprint.md](sprint.md)
