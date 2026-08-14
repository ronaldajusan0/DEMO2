# agent.md — Development Agent Guide

This file tells an automated coding agent how to work in the salon-booking
repository: what the project is, how it's structured, conventions to follow,
and the guardrails to respect.

## Project

Salon booking website. See [SPEC.md](SPEC.md) for full requirements.
Stack: React + TypeScript frontend, Node/Express + PostgreSQL backend.

## Directory Layout (target)

```
/frontend        React app (components, pages, hooks, api client)
/backend         Express API (routes, services, models, migrations)
/backend/db      SQL migrations and seed data
/docs            SPEC.md, sprint.md, auto-dev.md
/.github         Issue templates, workflows
```

## How the Agent Should Work

1. **Read the issue first.** Every task maps to a GitHub issue. Parse the
   acceptance criteria and referenced files before writing code.
2. **Branch per issue.** Name: `feat/<issue-#>-<slug>` or `fix/<issue-#>-<slug>`.
3. **Small, reviewable diffs.** One issue = one PR. Do not bundle unrelated changes.
4. **Test with the change.** Add or update tests in the same PR.
5. **Match surrounding code.** Follow existing naming, formatting, and patterns.
6. **Update docs** when behavior or API changes.

## Conventions

- **Language:** TypeScript everywhere; no implicit `any`.
- **Formatting:** Prettier + ESLint; run before commit.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
  Reference the issue: `feat: add availability endpoint (#12)`.
- **API:** REST, JSON, snake_case fields in DB, camelCase in JSON responses.
- **Errors:** Return structured `{ error: { code, message } }`; never leak stack traces.
- **Time:** UTC in DB and API; convert at display layer only.

## Commands

```
# Frontend
cd frontend && npm install && npm run dev
npm run test
npm run lint

# Backend
cd backend && npm install && npm run dev
npm run migrate
npm run test
npm run lint
```

## Definition of Done

- [ ] Acceptance criteria in the issue are met.
- [ ] Tests pass locally and in CI.
- [ ] Lint and typecheck pass.
- [ ] No secrets committed.
- [ ] Docs updated if API/behavior changed.
- [ ] PR links the issue and describes the change.

## Guardrails

- Never commit secrets, `.env`, or credentials.
- Never run destructive DB commands against non-local environments.
- Do not modify migrations already merged; add a new migration instead.
- Ask for human review before schema changes or deleting data.
- Do not disable auth, validation, or rate limiting to make tests pass.

## Escalate to Human When

- Requirements are ambiguous or conflict with SPEC.md.
- A change needs a schema migration on production data.
- A security-sensitive area (auth, payments, PII) is touched.
- A task spans more than can fit in one reviewable PR.
