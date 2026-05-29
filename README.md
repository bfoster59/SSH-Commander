# SSH Commander

A web-based, dual-pane file manager in the spirit of Total Commander — with a
local filesystem pane, secure remote **SSH/SFTP** browsing, an interactive
terminal (local shells *and* remote SSH), drag-and-drop transfers, archive
support, a multi-format file viewer, and a light/dark theme.

> For step-by-step usage of every feature, see **[WORK_INSTRUCTIONS.md](WORK_INSTRUCTIONS.md)**.

---

## Features

- **Dual panes** — each pane independently browses the **local filesystem** or a
  **remote SSH/SFTP** server.
- **Tabs per side** — open multiple tabs in each pane (local dirs and/or remote
  hosts at once); switching tabs preserves each tab's location and connection.
- **Connection manager** — saved profiles in `~/.ssh-commander/profiles.json`
  (**passwords are never written to disk** — entered at connect time).
- **Authentication** — password or **private-key file** (with optional passphrase).
- **Keyboard-driven** — Total Commander style function keys: `F3` View, `F4` Edit,
  `F5` Copy, `F6` Move/Rename, `F7` Mkdir, `F8` Delete, `F10` Disconnect.
- **Transfers** — copy/move within or between panes, **drag-and-drop**, and a
  live progress widget. Local ⇄ remote ⇄ remote all supported.
- **Interactive terminal** — per pane; local **PowerShell / pwsh / cmd / bash**
  (selectable) or a remote **SSH shell**. Can be **minimized** while it keeps
  running in the background.
- **Per-pane `CMD:` bar** — type a command, press Enter, and it runs in that
  pane's current directory (opens the terminal).
- **File viewer** — text with **syntax highlighting**, find + line numbers, plus
  **images, PDF, audio, video**.
- **File editor** — open, edit (with syntax highlighting), and save text files
  (local or remote).
- **Archives** — **Compress** a selection to `.zip` or `.tar.gz`, and
  **Extract** an archive in place.
- **Recursive search** — `Alt+F7` searches the active directory tree.
- **Sorting** — click column headers (Name / Size / Modified).
- **Light / dark theme** — toggle in the top bar (remembered across sessions).

---

## Prerequisites

- **Node.js 18 or newer** (developed on Node 24). `npm` ships with Node.
- **A C/C++ build toolchain** — the interactive terminal uses `node-pty`, a
  native module that may need to compile during `npm install` if no prebuilt
  binary exists for your platform:
  - **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
    with the **"Desktop development with C++"** workload (Python 3 recommended).
  - **macOS:** `xcode-select --install`
  - **Linux (Debian/Ubuntu):** `sudo apt-get install build-essential python3`
- **For remote features:** an SSH/SFTP server you can reach, plus its password or
  a private key file located **on the machine running SSH Commander**.
- **For remote ZIP archives:** the remote host needs `zip` / `unzip` installed.
  `.tar.gz` only needs `tar` (universally available).

---

## Installation

```bash
# Clone, then from the project directory:
npm install        # installs dependencies and builds node-pty
```

## Running (development)

```bash
npm run dev        # starts the server on http://localhost:3000
```

Open **http://localhost:3000** in your browser.

## Production build

```bash
npm run build      # bundles the client (vite) and the server (esbuild)
npm run start      # runs the bundled server from dist/ (production mode)
```

## Quality checks

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest unit tests (path/shell-quoting/classification logic)
```

## Configuration

No environment variables are required. Optional ones (see [.env.example](.env.example)):

| Variable      | Purpose                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `HOST`        | Address to bind. Defaults to `127.0.0.1` (loopback). Set `0.0.0.0` to expose it. |
| `DISABLE_HMR` | Set to `true` to turn off Vite hot-reload / file watching (dev only).            |

The server listens on **port 3000**. Open it via `localhost` / `127.0.0.1` — while
bound to loopback, requests with another `Host` header are rejected (see Security notes).

---

## Security & data notes

- Connection profiles are stored at `~/.ssh-commander/profiles.json` and contain
  **no secrets** — host, port, username, auth type, and key file path only.
- Passwords and key passphrases are entered at connect time and held **in memory
  only** for the life of the SSH session.
- Private keys are read from a path on the machine running SSH Commander; `~`
  expands to that machine's home directory.
- SSH Commander exposes local-filesystem and shell access through the browser.
  By default the server binds to **loopback (`127.0.0.1`) only**, so the API is
  not reachable from the network. Set `HOST=0.0.0.0` to expose it deliberately —
  but it ships with **no authentication**, so only do that behind your own auth
  on a trusted network.
- While bound to loopback, requests with an unexpected `Host` header are rejected
  (DNS-rebinding mitigation), and the interactive-terminal WebSocket rejects
  cross-site upgrade requests.
- The text viewer/editor refuses files larger than 10 MB to avoid exhausting
  server memory — transfer large or binary files rather than opening them.
