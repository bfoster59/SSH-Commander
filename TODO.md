# SSH Commander — Future Updates

Backlog of planned/optional improvements. None are blocking — the app is
hardened, tested, and CI-green on `main`. Roughly priority-ordered within groups.

## UX / theming
- [x] **Light-mode consistency for modals** — `FileViewer`/`FileEditor` chrome now
      uses the `var(--color-*)` tokens and follows light mode (#22). The code/media
      canvas intentionally stays dark (the `atom-one-dark` hljs palette needs it).
- [ ] **Light-mode syntax highlighting** — swap the highlight.js theme by mode
      (`atom-one-dark` ⇄ `atom-one-light`) so the code canvas can also follow light
      mode. Follow-up to the modal-chrome theming above.
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
- [x] **Code-split the client bundle** (#23) — `FileViewer`/`FileEditor`/`TerminalModal`
      are now lazy-loaded via `React.lazy` + `Suspense`. Entry chunk dropped from
      ~1.5 MB to 268 kB (gzip 79.8 kB); xterm and highlight.js load on demand.
- [ ] **Slim the highlight.js chunk** (~915 kB) — it bundles all languages. Register
      only the ~30 in `EXT_TO_LANG` via `highlight.js/lib/core` to shrink the lazy
      chunk that loads on first file view/edit.

## Testing
- [ ] Add **integration tests** for the API/transfer paths in CI (spin up a
      containerized SSH server) so remote behavior is covered automatically, not
      just manually as this session did.

## Dependency major upgrades (deliberate migrations)
Dependabot proposes each of these as its own PR. They need real migration work,
not a merge-and-go — tackle one at a time and run the full gate.
- [x] **Vite 6 → 8** (#20) — bumped `@vitejs/plugin-react` 5→6; Vite 8 bundles with
      Rolldown. (`@types/node` 25 and esbuild 0.28 landed earlier in the dep wave.)
- [x] **Express 4 → 5** (#21) — path-to-regexp v8 rejected the bare `"*"` catch-all;
      the SPA fallback now serves a boot-cached `index.html` from GET/HEAD middleware.
- [ ] Future majors: tackle one at a time, run the full gate, and prefer a runtime
      smoke (not just CI-green) for anything that changes server routing or the build.

## Features (optional / if scope grows)
- [ ] Optional **auth layer** (token) — required before any non-loopback exposure;
      today there is no auth and the server binds loopback by default.
- [ ] Reduce `node-pty` install friction (native build) — document/offer a
      terminal-optional mode or prebuilt path.
