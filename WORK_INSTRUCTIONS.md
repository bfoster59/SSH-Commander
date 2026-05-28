# SSH Commander — Work Instructions

A complete, step-by-step guide to installing and using every feature of SSH
Commander. For a short overview, see [README.md](README.md).

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Launching the app](#3-launching-the-app)
4. [Interface overview](#4-interface-overview)
   - [Working with tabs](#working-with-tabs)
5. [Switching a pane: Local vs SSH](#5-switching-a-pane-local-vs-ssh)
6. [Connecting to a remote server](#6-connecting-to-a-remote-server)
7. [Navigating files](#7-navigating-files)
8. [Selecting files](#8-selecting-files)
9. [Viewing files (F3)](#9-viewing-files-f3)
10. [Editing files (F4)](#10-editing-files-f4)
11. [Copying, moving & renaming (F5 / F6 / drag-drop)](#11-copying-moving--renaming)
12. [Creating folders (F7)](#12-creating-folders-f7)
13. [Deleting (F8)](#13-deleting-f8)
14. [Searching (Alt+F7)](#14-searching-altf7)
15. [Compressing & extracting archives](#15-compressing--extracting-archives)
16. [Using the terminal](#16-using-the-terminal)
17. [Light / dark theme](#17-light--dark-theme)
18. [Disconnecting (F10)](#18-disconnecting-f10)
19. [Production deployment](#19-production-deployment)
20. [Troubleshooting](#20-troubleshooting)
21. [Keyboard reference](#21-keyboard-reference)

---

## 1. Prerequisites

- **Node.js 18+** (developed on Node 24) and **npm**.
- **A C/C++ build toolchain** (for the `node-pty` terminal module):
  - **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) → "Desktop development with C++" workload (Python 3 recommended).
  - **macOS:** `xcode-select --install`
  - **Linux:** `sudo apt-get install build-essential python3`
- **Remote use:** an SSH/SFTP server, plus its password or a private key file on
  the machine running SSH Commander.
- **Remote ZIP:** `zip`/`unzip` installed on the remote host (`.tar.gz` needs only `tar`).

## 2. Installation

From the project directory:

```bash
npm install
```

This installs all dependencies and compiles `node-pty`. If `node-pty` fails to
build, confirm the build toolchain above is installed, then re-run `npm install`.

## 3. Launching the app

```bash
npm run dev
```

Then open **http://localhost:3000**.

> If you change `server.ts`, restart `npm run dev` — the server is not hot-reloaded.

## 4. Interface overview

```
┌─ SSH_COMMANDER ──────────────────────[ CONNECT SSH ][ RECURSIVE SEARCH ]──☀/🌙─┐
│ ACTIVE HOST: …            SESSION: 00:00:00                                     │
├───────────────────────────────────┬────────────────────────────────────────────┤
│ [local: project ×][+]             │ [ssh prod:/etc ×][local: D:\ ×][+]         │
│ ▾ Local Filesystem            ⟳   │ ▾ SSH / SFTP server               ⟳        │
│ PATH  c:\…\project             ↑  │ PATH  /home/user                    ↑      │
│ PRESETS  C:\ D:\ …                │ PRESETS …                                  │
│ NAME            SIZE  PERMS  MOD  │ NAME            SIZE  PERMS  MOD            │
│ [ .. ]                            │ [ .. ]                                      │
│  src        <DIR>                 │  etc         <DIR>                          │
│  …                                │  …                                         │
│ Files: 11 | Dirs: 5    Selected:  │ Files: … | Dirs: …       Selected:         │
│ CMD: c:\…\project $ ▍             │ CMD: /home/user $ ▍                         │
├───────────────────────────────────┴────────────────────────────────────────────┤
│  F3 View  F4 Edit  F5 Copy  F6 Move  F7 Mkdir  F8 Delete  F10 Exit              │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar:** brand, `CONNECT SSH`, `RECURSIVE SEARCH`, live host/session info,
  and the **theme toggle** (☀/🌙).
- **Two panes:** each has a **tab strip**, a type dropdown, refresh (⟳), an
  editable **PATH** bar, a **Go Up** (↑) button, drive/preset shortcuts, the file
  table, a status line, and a **`CMD:`** command bar.
- **Function-key bar** at the bottom mirrors the `F3`–`F10` actions.
- The **active pane** is highlighted; click a pane or press `Tab` to switch.

### Working with tabs

Each pane has its own **tab strip** at the top, so you can keep several
directories — and several remote hosts — open at once on the same side.

- **New tab:** click **`+`** on the strip. A new tab opens on the local
  filesystem; switch it to SSH or connect from it as usual.
- **Switch tab:** click a tab. Its location, listing, selection, and SSH
  connection are **preserved** — nothing reloads or disconnects.
- **Close tab:** click the **`×`** on the tab. If it was a remote tab, its SSH
  session is disconnected automatically. A side always keeps at least one tab.
- A green dot marks a **remote** tab; a grey dot marks a **local** tab. The tab
  label shows the host (or "local") and the current folder.
- Copy/move/drag and all function keys act on the **active tab** of each side, so
  you can park multiple remotes in tabs and transfer between whichever two are focused.

## 5. Switching a pane: Local vs SSH

Use each pane's top-left dropdown:

- **📁 Local Filesystem** — browses the machine running SSH Commander. Use the
  **drive buttons** (Windows `C:\ D:\ …`) or **PATH** bar to jump around.
- **🌐 SSH / SFTP server** — opens the connection dialog (see next section).

## 6. Connecting to a remote server

1. Click **`CONNECT SSH`** (top bar) or switch a pane's dropdown to **SSH/SFTP server**.
2. In the dialog:
   - **Profiles** (left) — saved connections. Click one to load it; `+` starts a new one; the trash icon deletes one.
   - **Configuration** (right) — fill **Profile Name, Host/IP, Port, Username**.
   - **Authentication Style:**
     - **Password** — type it in the Password field (entered each connect, **not saved**).
     - **Private Key File** — enter the **path** to your key (e.g. `~/.ssh/id_ed25519`); add a **passphrase** if the key is encrypted (also not saved). `~` expands to the home directory of the machine running SSH Commander.
3. **Save Profile** stores everything **except** secrets to `~/.ssh-commander/profiles.json`.
4. **Establish connection** connects the **active pane**; on success it shows the
   remote home directory.

## 7. Navigating files

| Action            | How                                                            |
| ----------------- | ------------------------------------------------------------- |
| Switch pane       | `Tab`, or click the pane                                      |
| Move selection    | `↑` / `↓`                                                     |
| Open / enter      | `Enter` (folder = open; file = view), or **double-click**     |
| Go up a folder    | `Backspace`, the **↑** button, or open the top **`[ .. ]`** row|
| Jump to a path    | Click the **PATH** value, type a path, press Enter            |
| Jump to a drive   | Click a drive button in the **PRESETS** row (local panes)     |
| Refresh           | The **⟳** button                                              |
| Sort              | Click the **NAME / SIZE / MODIFIED** column headers (toggles asc/desc) |

The **`[ .. ]`** row is always present (even in empty folders) so you can always go up.

## 8. Selecting files

- **Single:** click a row, or move with `↑`/`↓`.
- **Multiple:** `Shift+↑` / `Shift+↓` to extend a range (or `Shift`-click).
- The status line shows the current selection; operations act on the selection,
  or on the highlighted row if nothing is multi-selected.

## 9. Viewing files (F3)

Select a file and press **`F3`** (or double-click it). The viewer auto-detects type:

- **Text / code** — **syntax highlighted** (language detected from the file
  extension), scrollable with line numbers and a **Find** box.
- **Images** (`png/jpg/gif/webp/svg/…`), **PDF**, **video**, **audio** — rendered inline.

Close with the **✕** button.

## 10. Editing files (F4)

Select a text file and press **`F4`**. The editor shows **syntax highlighting** as
you type. Edit the contents and **Save** (button or **`Ctrl+S`**); changes are
written back to the local file or the remote server over SFTP.

## 11. Copying, moving & renaming

- **Copy (`F5`)** — copies the selection from the active pane into the **other**
  pane's current folder (confirm the prompt). A progress widget tracks the
  transfer and auto-dismisses when done (or click **OK**).
- **Drag-and-drop** — drag selected rows onto the other pane to copy them there.
- **Move / Rename (`F6`)** — one item: rename or move (enter a new name or path).
  Multiple items: moves them to the other pane's folder.
- Works **local ⇄ remote** and **remote ⇄ remote** in any combination.

## 12. Creating folders (F7)

Press **`F7`**, enter a name, and a new folder is created in the active pane's
current directory.

## 13. Deleting (F8)

Select items and press **`F8`** (or `Delete`). Confirm the prompt; deletion is
**recursive** for folders.

## 14. Searching (Alt+F7)

Press **`Alt+F7`** (or click **RECURSIVE SEARCH**). Enter a substring/pattern; the
active pane's directory tree is searched (locally or over SSH). Double-click a
result to jump to its location.

## 15. Compressing & extracting archives

- **Compress:** select one or more items, **right-click → "Compress…"**, and enter
  an archive name. The format is inferred from the extension — `.zip` (default) or
  `.tar.gz` / `.tgz`. The archive is created in the current folder.
- **Extract:** right-click a `.zip` / `.tar.gz` file → **"Extract here"**. It
  extracts into a new subfolder named after the archive.
- Local archives work with no external tools. **Remote ZIP** needs `zip`/`unzip`
  on the server; remote `.tar.gz` needs `tar`.

## 16. Using the terminal

Two ways to open it:

- **`CMD:` bar** (under each pane) — type a command and press `Enter`. The terminal
  opens in that pane's current directory and runs the command (great for `claude`,
  `npm run …`, `git …`, etc.).
- **Right-click → "Open Terminal Here"** — opens a shell in the folder/selection.

Inside the terminal:

- **Shell selector** (local panes) — **Default / PowerShell / pwsh / cmd.exe / bash (WSL)**.
- A remote pane opens an **interactive SSH shell** on that host.
- **Minimize** (yellow dot or the *Minimize* button) collapses it to a pill in the
  bottom-right **while the process keeps running** — click the pill to restore.
- **Traffic-light dots:** 🔴 close (ends the session) · 🟡 minimize · 🟢 restore/fit.
- **Clear** wipes the screen buffer.

## 17. Light / dark theme

Click the **☀ / 🌙** button in the top bar to switch themes. Your choice is saved
and restored on the next visit.

## 18. Disconnecting (F10)

With a remote pane active, press **`F10`** (or **Exit**) to close the SSH session
and return that pane to the local filesystem.

## 19. Production deployment

```bash
npm run build      # bundle client + server
npm run start      # run the bundled server (serves on port 3000)
```

Ensure the same prerequisites (Node + build toolchain for `node-pty`) exist on the
target machine. Run behind a trusted network — SSH Commander grants filesystem and
shell access via the browser.

## 20. Troubleshooting

| Symptom                                   | Fix                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `npm install` fails on `node-pty`         | Install the C/C++ build toolchain (section 1), then re-run install. |
| Terminal won't connect / new API 404s     | Restart `npm run dev` after any `server.ts` change.                 |
| Port 3000 already in use                  | Stop the other process, or free the port, then `npm run dev`.       |
| "Could not read private key file"         | Check the key **path** (on the SSH Commander host); `~` = home dir. |
| Remote "Compress…" to `.zip` errors       | Install `zip`/`unzip` on the remote, or use `.tar.gz`.              |
| Remote pane shows the wrong files         | Reconnect via `CONNECT SSH`; confirm host/credentials.              |

## 21. Keyboard reference

| Key            | Action                                  |
| -------------- | --------------------------------------- |
| `Tab`          | Switch active pane                      |
| `↑` / `↓`      | Move selection                          |
| `Shift+↑/↓`    | Extend multi-selection                  |
| `Enter`        | Open folder / view file                 |
| `Backspace`    | Go up one directory                     |
| `F3`           | View file                               |
| `F4`           | Edit file                               |
| `F5`           | Copy to other pane                      |
| `F6`           | Move / rename                           |
| `F7`           | Make directory                          |
| `F8` / `Delete`| Delete selection (recursive)            |
| `F10`          | Disconnect remote / reset pane          |
| `Alt+F7`       | Toggle recursive search                 |

> Function keys act on the **active** pane. Click a pane (or `Tab`) to focus it
> first. Shortcuts are ignored while typing in an input, the terminal, or the editor.
