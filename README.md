# Echo Desktop

A private-labeled desktop client for the **echo-server** homeserver, built as a
rebranded fork of [element-hq/element-desktop](https://github.com/element-hq/element-desktop)
(develop @ 1.12.13). All Element branding is replaced by **Echo**, the client is
pinned to `https://echo-server-a4ae.onrender.com`, and the Electron shell gains
an operator shortcut suite for desktop-overlay use.

See [`ECHO_DESKTOP.md`](ECHO_DESKTOP.md) for the full technical inventory of
changes and [`ECHO_PLATFORM_SPEC.md`](ECHO_PLATFORM_SPEC.md) for the platform
contract.

## Highlights

- **Full Echo rebrand** — window/app name, icons (all sizes), login/welcome
  branding, manifest, and every user-visible "Matrix"/"Element" string across
  all 42 locales, applied as an idempotent pack-time patch
  (`scripts/echo-brand-patch.ts`) that survives re-fetches.
- **Pinned to echo-server** — no Element-hosted services: no telemetry, no
  auto-update, no integrations, guests disabled; registration uses the native
  `m.login.registration_token` UIAA field.
- **Desktop-op shortcuts** (in `src/echo-shortcuts.ts`):

  | Shortcut | Action |
  | :--- | :--- |
  | Ctrl+Shift+B | Hide/show the window (OS-wide) — restore never comes back maximized |
  | Ctrl+T / Ctrl+U | Whole-window opacity −/+10% per press (floor 0%) |
  | Ctrl+Alt+M | Click-through ghost mode (OS-wide): mouse passes through, keyboard focus dropped, all other Echo shortcuts inert |
  | Ctrl+Arrows | Move the window — hold to keep stepping (20 px/step), release to stop |
  | Ctrl+Q | Quit the app |

  The window floats **always-on-top permanently** and **launches as a 40%
  ghost** (click-through, unfocused) until Ctrl+Alt+M makes it interactive.

## Building

```sh
pnpm install
pnpm run fetch develop -d element.io/echo   # fetch element-web + pack webapp.asar (Echo variant)
pnpm run build:64                           # tsc + copy-res + electron-builder (win x64)
pnpm start                                  # dev run
```

Outputs in `dist/`: the portable build (`win-unpacked/Echo.exe`, launchable via
`dist/Echo.vbs`), `Echo <version>.msi` and `dist/squirrel-windows/Echo Setup
<version>.exe`. Build artifacts are gitignored and not committed.

## License

Upstream licensing applies (AGPL-3.0-only OR GPL-3.0-only OR
LicenseRef-Element-Commercial); Echo-specific additions keep the same terms.
