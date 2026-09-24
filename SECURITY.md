# Security Policy

## Supported versions

The most recent `vX.Y.Z` release tag on the `production` branch is
supported. Older releases are supported on a best-effort basis.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use **GitHub's private vulnerability reporting** for this repository:

1. Go to the repository's **Security** tab → **Report a vulnerability**.
2. Or email the maintainer: `horizonsmachine@gmail.com`.

If you prefer not to use the Security tab, email the maintainer directly
with a short description, a proof-of-concept if available, and your
contact details.

We aim to acknowledge within **48 hours** and to provide a fix or a
coordinated disclosure plan within **14 days** for critical issues.

## Scope

In scope:

- The Tauri desktop app (Rust backend + Svelte frontend) as built from
  this repository.
- The bundled SQLite persistence and any generated build artifacts
  (MSI) produced from this repository.

Out of scope:

- Upstream third-party AI model providers / their APIs.
- Users' own local data files (SQLite DB, project/session data).
- Unofficial forks that do not derive from this repository.

## Disclosure

We prefer coordinated disclosure. We will credit reporters who give us
notice and enough time to ship a fix, on request.

> Maintainer: enable code-scanning settings and consider adding a
> `.github/dependabot.yml` before publishing.
> (No secrets currently live in the repo — see `docs/` and the
> `secrets/` gitignore entry.)
