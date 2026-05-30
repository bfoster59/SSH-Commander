# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities **privately** — do not open a public issue.

Use GitHub's **[Report a vulnerability](https://github.com/bfoster59/SSH-Commander/security/advisories/new)**
button (the repo's **Security → Advisories** tab) to open a private report. I'll
acknowledge within a few days and keep you posted on a fix.

## Supported versions

This project is pre-1.0; only the latest `main` is supported, and fixes land there.

## Security model (please read before reporting)

SSH Commander intentionally exposes local-filesystem and shell access through the
browser. By design:

- The server **binds to loopback (`127.0.0.1`) only** by default, rejects requests
  with an unexpected `Host` header (DNS-rebinding mitigation), and the
  interactive-terminal WebSocket rejects cross-site upgrade requests.
- It ships with **no authentication**. Setting `HOST=0.0.0.0` exposes the API to the
  network — only do that behind your own auth on a trusted network. "Exposing it with
  `HOST=0.0.0.0` and no auth is insecure" is expected behavior, not a vulnerability.
- Connection profiles are stored without secrets; passwords/passphrases live in memory
  only for the life of the session.

Reports of **command injection, path traversal beyond the intended model, or bypasses
of the auth/origin/Host guards** — anything that escalates past the documented
loopback model — are very welcome.

## Automated code-scanning (CodeQL) findings

CodeQL's `security-and-quality` suite flags patterns that are inherent to what this tool
*is*. They appear **dismissed** in the Security tab with documented reasons — not ignored,
but accepted as the feature operating within the loopback model above:

- **`js/path-injection`** — browsing and operating on user-chosen local/remote paths is the
  core of a file manager. Mitigated by the loopback bind + Host-header guard.
- **`js/command-line-injection`** — remote shell actions pass paths through `shq()`, a
  single-quote shell escaper (unit-tested in `tests/server-utils.test.ts`); the terminal
  endpoint intentionally runs the user's own typed command on their own machine.
- **`js/missing-rate-limiting`** — single-user and loopback-bound with no network exposure
  by default, so per-route rate limiting does not apply.
- **`js/http-to-file-access`** — writing user-provided content to disk (connection profiles,
  file save) is a feature.

Findings introduced by *new* changes are triaged individually on each PR, not blanket-dismissed.
