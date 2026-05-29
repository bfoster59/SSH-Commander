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
