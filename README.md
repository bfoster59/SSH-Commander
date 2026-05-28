# SSH Commander

A web-based, dual-pane file manager in the spirit of Total Commander — with a
real local filesystem pane, secure remote SSH/SFTP browsing, an interactive
terminal (local shells + remote SSH), and a built-in multi-format file viewer.

## Features

- Dual-pane layout with keyboard-driven navigation (F3 view, F4 edit, F5 copy,
  F6 move, F7 mkdir, F8 delete, F10 disconnect)
- Local filesystem and remote **SSH/SFTP** browsing in either pane
- Saved connection profiles (stored on the host in `~/.ssh-commander/profiles.json`;
  passwords are never written to disk)
- Password or **private-key-file** authentication
- Interactive terminal per pane (PowerShell / pwsh / cmd / bash locally, or a
  remote SSH shell) that can be **minimized** while it keeps running
- Per-pane `CMD:` command bar
- Drag-and-drop transfers between panes
- File viewer for text, images, PDFs, audio, and video
- Recursive search, multi-file selection, light/dark theme toggle

## Prerequisites

- **Node.js 18 or newer** (developed on Node 24). Includes `npm`.
- **A C/C++ build toolchain** — required because `node-pty` (the interactive
  terminal) is a native module that may need to compile if no prebuilt binary
  is available for your platform:
  - **Windows:** install the
    [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
    ("Desktop development with C++" workload). Python 3 is also recommended.
  - **macOS:** `xcode-select --install`
  - **Linux:** `sudo apt-get install build-essential python3` (or your distro's
    equivalent)
- For remote features: an SSH/SFTP server you can reach, and either its password
  or a private key file on the machine running SSH Commander.

## Install & run

```bash
# 1. Install dependencies (this also builds node-pty)
npm install

# 2. Start the dev server
npm run dev

# 3. Open the app
#    http://localhost:3000
```

### Production build

```bash
npm run build   # bundles the client and the server
npm run start   # runs the bundled server from dist/
```

## Configuration

No environment variables are required. See [.env.example](.env.example) for the
optional `DISABLE_HMR` flag.

## Notes

- Connection profiles live in `~/.ssh-commander/profiles.json`. Credentials
  (passwords / key passphrases) are entered at connect time and are **not**
  persisted.
- Private keys are read from a path on the machine running SSH Commander; `~`
  expands to that machine's home directory.
