# Changelog

All notable changes to SSH Commander are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-06-16

First stabilized release — two reliability fixes to the core SSH + transfer experience.

### Fixed
- **The SSH connection no longer drops while idle.** Added ssh2 keepalive
  (`keepaliveInterval` / `keepaliveCountMax`) and removed a 15-minute idle reaper
  that was force-closing *live* sessions. A connection now stays up for as long as
  it is actually connected, instead of dropping after a few minutes and resetting
  the pane back to local-drive selection.
- **Folder transfers no longer abort on a single bad file.** A recursive copy/move
  now skips an entry it can't read — a broken symlink, or a filename legal on the
  source OS but illegal on the destination — and keeps going, then finishes with a
  **"Completed with errors"** summary naming which files failed and why, instead of
  dying mid-batch behind a generic "transfer failed."
- **Move is data-loss-safe on partial failure.** A `move` deletes the source only
  when every file copied successfully; if any file failed, the source is kept.
- **Honest failure on a dropped connection.** If the SSH session drops mid-transfer,
  the job now fails clearly instead of mis-reporting every remaining file as an
  individual per-file failure.
