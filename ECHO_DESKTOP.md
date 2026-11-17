# Echo Desktop

Fork of [element-desktop](https://github.com/element-hq/element-desktop) (develop,
1.12.13, pristine upstream source — audit-verified) rebranded and adapted to the
**echo-server** homeserver, per `ECHO_PLATFORM_SPEC.md` (§5 is the contract).

## Variant

Everything Echo-specific lives in `element.io/echo/` (upstream `release/` and
`nightly/` variants are untouched for diffing):

| File | Contents |
| :--- | :--- |
| `element.io/echo/build.json` | `appId: com.echo.desktop`, `name: echo-desktop`, `productName: Echo`, protocols `io.echo.desktop` + `echo` |
| `element.io/echo/config.json` | homeserver `https://echo-server-a4ae.onrender.com`, `brand: Echo`, no telemetry, calls kept, room directory + presence scoped to echo-server, `setting_defaults` with `audioNotificationsEnabled`/`notificationSound` = `false` (no notification sounds) |

`electron-builder.ts` loads `element.io/echo/build.json` as the default variant
(upstream used `element.io/release`).

## Deviations from upstream source

| Change | Why |
| :--- | :--- |
| `src/build-config.ts` | reads the full `electron_protocols` list (not just the primary scheme); Echo dev defaults `["io.echo.desktop", "echo"]` / appId `com.echo.desktop` |
| `src/protocol.ts` | registers/accepts **all** variant schemes; the legacy `element://` scheme is only registered when the primary protocol is `io.element.desktop` — Echo must not hijack Element's deep links |
| `src/electron-main.ts` | passes extra schemes to `ProtocolHandler` |
| `electron-builder.ts` | default variant → echo; `extraMetadata` now also carries `electron_protocols` |
| `package.json` | `name: echo-desktop`, `productName: Echo` |
| `scripts/fetch-package.ts` | injects `public/bg.jpg` + `public/echo_app_logo.png` into the webapp bundle as `img/echo-bg.jpg` / `img/echo-logo.png` so config-relative branding URLs work inside `webapp.asar`, then runs the Echo rebrand patch (below) before packing |
| `scripts/echo-brand-patch.ts` | pack-time rebrand of the webapp: user-visible Matrix strings in all 42 locale files, `index.html` (title/meta/noscript/og:image), `manifest.json` (name/theme_color Echo Navy `#071A6E`), `vector-icons/*` and theme logos (fed from the `%TEMP%\echo-icons\` cache). Idempotent; JSON keys, `matrix.to`/`matrix.org` URLs, `_matrix` API paths and `%(matrixId)s` placeholders are preserved |
| `scripts/make-echo-icons.ps1` / `scripts/make-echo-ico.mjs` | icon generation from `public/echo_blue_gradient.png` (Windows helper; also produces the per-size cache for the rebrand patch and the 1200×630 opengraph image; macOS `.icns` deferred) |
| `src/echo-shortcuts.ts` (+ hook in `electron-main.ts`) | Echo app-wide shortcuts: **Ctrl+Shift+B** hide/show window (OS-wide, so it restores while hidden; tray keeps it alive), **Ctrl+T / Ctrl+U** whole-window opacity −/+10% per press (floor 0% — fully invisible, though the invisible window still catches clicks until you raise it; session-only), **Ctrl+Alt+M** click-through ghost mode (OS-wide; mouse passes through, keyboard focus dropped and all other Echo shortcuts inert until pressed again), the window floats **always-on-top permanently** (independent of ghost mode), and **Ctrl+Arrows** window movement (holding auto-repeats like a held key and stops where released), and **Ctrl+Q** quit (bypasses the tray, standard confirm dialog). Ctrl+Shift+B restore always returns the window as a **standard windowed app — never maximized** (even if it was hidden while maximized). A transient HUD pill confirms each state |

## Webapp adaptation facts (verified against the bundled element-web)

- **Registration code**: the webapp natively renders the `m.login.registration_token`
  UIAA stage as a text field (`AuthType.RegistrationToken` + MSC3231 unstable variant,
  `InteractiveAuthEntryComponents` registration-token form). No patching needed.
- **Device display name**: config key `default_device_display_name` is read before the
  platform fallback — set to `"Echo Desktop"` (spec §2.2/§5.1) via config, not code.
- **Branding keys** (snake_case under `branding`, per this build's `init.js` defaults):
  `auth_header_logo_url` → `img/echo-logo.png`, `welcome_background_url` →
  `img/echo-bg.jpg`, `logo_link_url` → `""`. (`authBackground` does not exist in this build.)
- **Guests disabled** (`disable_guests: true` in the Echo config): guest accounts
  cannot exist on echo-server, so guest fallbacks (which could otherwise hit
  matrix.org) are off.
- **Rebrand sweep** (via `scripts/echo-brand-patch.ts`, applied at every pack):
  the only user-visible "Matrix" left anywhere in the bundled UI is the
  `%(matrixId)s` placeholder in `timeline/disambiguated_profile`, which is a
  code placeholder, not display text.

## Config removals vs the upstream release variant

No Echo update server, analytics, or Element-hosted services exist, so these
upstream keys are dropped (auto-update is cleanly disabled when
`update_base_url` is absent — see `src/updater.ts`):

- `update_base_url` → auto-update off
- `posthog`, `bug_report_endpoint_url`, `uisi_autorageshake_app` → telemetry/rageshake to Element servers, off
- `map_style_url` (external MapTiler), `integrations_*` (scalar.vector.im), identity server, T&C/privacy links
- `default_server_name` / `matrix.org` defaults → fully pinned to echo-server

The registration code is **not** baked into the config (spec §5.11 — operator's
secret); users type it at signup in the registration-token UIAA field.

## Build

```sh
pnpm run fetch develop -d element.io/echo   # downloads element-web develop build + packs webapp.asar
pnpm run build:64                           # tsc + copy-res + electron-builder --x64
# dev run: pnpm start
```

> Note: `pnpm fetch …` (without `run`) is a **built-in pnpm command** and silently
> does the wrong thing — always `pnpm run fetch`.

### Run without installing

`dist/win-unpacked/Echo.exe` is the full portable build. `dist/Echo.vbs`
(a copy sits on the Desktop) launches it with no console window. It shares the
profile with the installed app (`%APPDATA%\Echo`), so the login session carries
over — but only one of them can run at a time (single-instance lock).

### Packaged installers

`pnpm run build:64` also produces `dist/Echo 1.12.13.msi` and
`dist/squirrel-windows/Echo Setup 1.12.13.exe`. These are **not** committed —
`dist/` is gitignored along with all other build artifacts (`deploys/`,
`packages/`, `webapp.asar`, `lib/`, `node_modules/`).

## Known limitations

- **Full-text search (seshat) not built**: `pnpm run hak` requires `perl` (OpenSSL
  configure) and a full Rust/MSVC toolchain. The app runs fine without it
  (`src/seshat.ts` degrades gracefully); build it later with Perl installed, or via
  `docker:build:native`.
- **Help links** (`help_url`, `help_encryption_url`) still point at Element's help
  pages (cosmetic; no Echo help page exists yet).
- **Auto-update disabled** by design (no Echo update server).

