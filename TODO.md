# SSH Commander — Future Updates

Backlog of planned/optional improvements. None are blocking — the app is
hardened, tested, and CI-green on `main`. Roughly priority-ordered within groups.

## UX / theming
- [ ] **Light-mode consistency for modals** — `FileViewer` and `FileEditor` use a
      hardcoded dark `slate-*` palette and ignore the theme; convert to the
      `var(--color-*)` tokens so they follow light mode like the rest of the app.
- [ ] **Selected/focused row contrast** — `FileTable.tsx` rows use `text-white` over
      light-ish selection backgrounds; low-contrast in light mode (use `--color-content`).
- [ ] Toast/confirm polish — keyboard focus trap + `Esc`/`Enter` handling in `Dialogs.tsx`.

## Architecture / maintainability
- [ ] **Refactor `executeBackgroundTransfer`** (`server.ts`, ~340 lines, 4 copy
      permutations) into a `source-reader × target-writer` abstraction. Requires a
      live SSH server to test (see handoff for the WSL recipe).
- [ ] Tighten remaining `any` types at the JSON/SSH boundaries (lint rule currently off).
- [ ] Resolve the `react-hooks/exhaustive-deps` warnings (esp. the global keydown
      `useEffect` in `App.tsx`) and the few unused-var warnings.

## Performance
- [ ] **Code-split the client bundle** (~1.6 MB, trips Vite's 500 kB warning):
      lazy-load `FileViewer`/`FileEditor`/`TerminalModal` and their heavy deps
      (xterm, highlight.js, PDF), or configure `build.rollupOptions.output.manualChunks`.

## Testing
- [ ] Add **integration tests** for the API/transfer paths in CI (spin up a
      containerized SSH server) so remote behavior is covered automatically, not
      just manually as this session did.

## Features (optional / if scope grows)
- [ ] Optional **auth layer** (token) — required before any non-loopback exposure;
      today there is no auth and the server binds loopback by default.
- [ ] Reduce `node-pty` install friction (native build) — document/offer a
      terminal-optional mode or prebuilt path.
