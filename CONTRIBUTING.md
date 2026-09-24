# Contributing to VisionMachine

Thanks for considering a contribution. This document describes how to set
up the project, how branches work, and how to submit issues and pull
requests.

## Development setup

### Prerequisites

- Node.js 18+ (CI uses Node 20)
- Rust stable toolchain (MSVC on Windows — Tauri links against MSVC)
- Tauri CLI (`npm i -g @tauri-apps/cli`, or use `npx tauri`)
- For E2E: Playwright browser targets (`npx playwright install`)

### Install and run

```bash
npm install

# Frontend dev server only (browser mode, localStorage persistence)
npm run dev

# Full Tauri desktop app
npm run tauri dev
```

### Common scripts

| Command             | Purpose                          |
| ------------------- | -------------------------------- |
| `npm run build`     | Vite production build            |
| `npm run check`     | svelte-check type-check          |
| `npm run test`      | vitest unit tests                |
| `npm run test:watch`| vitest in watch mode             |
| `npm run test:e2e`  | Playwright E2E tests             |
| `npm run tauri build` | Desktop release build         |

CI runs `npm run build`, `npm run check`, and `npm run test` on every push
to `develop`/`main`/`master` and on pull requests, plus a `cargo check` on
`src-tauri` (Windows runner). Please make sure these pass before opening a
PR.

## Branch model

- `develop` — active development; feature branches are cut from here and PR
  back into it.
- `production` — stable releases only. No direct feature work here.
- `feature/<topic>` — short-lived branches for a single change.

## How to contribute

1. **Open an issue first** for anything non-trivial (bugs, new features,
   refactors touching multiple modules). This lets the maintainers confirm
   the approach and avoids duplicated work.
2. Create a feature branch from `develop`.
3. Make your change with tests where they exist for the area you touch.
4. Run `npm run check` and `npm run test` locally (and `cargo check` for
   Rust changes).
5. Open a pull request into `develop` using the PR template.

## Code style

- Follow the existing code in the files you edit; there is no separate
  style guide yet.
- Frontend: Svelte 5 runes (`$state`, `$derived`), TypeScript strict.
- Run formatters/linters configured in the repo (`eslint`, `prettier`) before
  submitting.
- Keep commits small and focused; one logical change per commit.
- Commit message: imperative subject, ≤ 50 chars, no trailing period, e.g.
  `Add tag conflict resolver for drag-resize`.

## Issues

Use the issue templates:

- `bug_report.md` — for defects
- `feature_request.md` — for new behavior

If the template does not fit (question, docs, discussion), open a blank
issue.

## Pull requests

Use the PR template. Before opening:

- Self-check against the checklist in the template.
- **One issue / one logical change per PR.** Do not bundle drive-by
  refactors, reformatting, or unrelated fixes into a bug-fix PR.
- **Small and focused.** Keep PRs within the size gate (currently
  **≤ 10 files and ≤ 400 changed lines**); larger work should be split
  into multiple PRs. Oversized PRs are flagged by CI and not merged as-is.
- Link the issue(s) the PR closes (`Closes #123`).
- **AI-assisted work:** disclose it via the PR-template checkbox, and
  state what you personally verified. Mass AI-generated dumps with no
  manual review are not accepted.
- PRs that fail CI (build, type-check, unit tests, cargo check) will not be
  merged.
- Breaking API or data-model changes: say so explicitly in the description
  and note the migration.

## Data & storage notes

SQLite is the source of truth (Tauri backend); `localStorage` is only used
as a fallback in browser/E2E mode. When changing the data model, keep both
paths consistent and run the unit tests that cover persistence.

## License / contribution agreement

The project is licensed **GPL-3.0-or-later** with an attribution
addendum (see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md)).

By submitting a contribution you represent that:

- Your contribution is original or properly licensed, and is compatible
  with GPL-3.0-or-later.
- Your contributions are incorporated into the project under
  **GPL-3.0-or-later** (the project's license).
- You will not remove or strip the copyright notice /
  attribution (© 2026 @HorizonesMachines) that applies to the project's
  own code.

The full copyright and attribution terms live in
[NOTICE.md](NOTICE.md).
