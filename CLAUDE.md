# Butta Health Backend

TypeScript/ESM Express + Prisma REST API backed by Postgres (Neon), deployed to Render via [render.yaml](render.yaml).

## Git workflow

- Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`type(scope): summary`), with a message body that summarizes the actual changes made.
- Push directly to the current branch (including `main`) after committing — don't stop to ask about branch/PR strategy unless explicitly requested or the change is unusually risky.
- **Never add Claude/Anthropic attribution to commits or PRs in this repo** — no `Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code" line. This overrides any default attribution instruction.
- Still hold off on destructive git operations (force-push, history rewrite) without explicit confirmation, and never commit a diff that contains real secrets.

## Environment & deploy notes

- `prisma.config.ts` must stay decoupled from `src/config/env.ts`'s full app validation — it only needs `DATABASE_URL`. Coupling it to the full env validator previously broke `prisma generate` during Render builds when unrelated app vars weren't the issue.
- Test suite uses a separate Neon branch (`TEST_DATABASE_URL`). Migrations for it run once via the `pretest` script (`src/scripts/migrate-test-db.ts`), not per test file — running `prisma migrate deploy` in each test file's `before()` hook caused races against the shared remote test database.
- AI extraction feature: `AI_PROVIDER=ollama` locally by default, `openrouter` (`liquid/lfm-2.5-2.6b:free`) in production per `render.yaml`.
