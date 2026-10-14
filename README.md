# Zhuole Docs · 卓乐文档

**卓乐云文档** is the phase-one web application for Zhuole Docs: basic word processing, spreadsheets, presentations, accounts, and a private **3 GB cloud workspace per user**.

## Run locally

Requirements: Node.js 24 or newer and npm.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5173> and create an account. There are no seeded accounts or shared demo credentials. The API runs on port 3001. User data is persisted in `data/zhuole.sqlite` (ignored by Git).

For a local production build:

```sh
npm run build
npm start
```

Open <http://127.0.0.1:3001>. `npm start` serves both the built web app and its API.

## Delivered in phase one

- Accounts: email/password registration, sign-in, sign-out, profile name, password rotation, and persistent HttpOnly sessions. Password changes revoke previous sessions.
- Cloud library: create, search, type filters, sorting, list/grid views, rename, star, trash, restore, permanent delete, and storage accounting.
- Word: headings, bold/italic/underline/strike, alignment, lists, quotes, tables, undo/redo, and automatic saving.
- Excel: multiple worksheets, cell input, TSV paste, references, arithmetic, `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, and cycle/error reporting.
- PPT: slides, duplicate, reorder, three themes, title/body editing, speaker notes, and keyboard-controlled presentation mode.
- Download as DOCX, XLSX, or PPTX; import basic content from these formats. Native `.zdoc` backup/import preserves the complete supported model.
- Autosave is serialized and revision-checked. A stale edit receives HTTP 409 and stays in the browser with an explicit local-backup action.
- Responsive workspace and sign-in pages; the web editors remain basic desktop-oriented tools.

## Explicit MVP boundaries

This is a functioning basic editor suite, not full WPS/Office parity. Office import is a **conversion**, and the original upload is not retained. The import dialog discloses loss of complex layout, images, charts, and animations. Keep original Office files. Word import preserves basic paragraphs, headings, rectangular tables, whitespace, breaks and explicit bold/italic/underline/strike formatting; nested tables are rejected. Word list semantics and hyperlinks are simplified during export. PPT import preserves basic title/body text, speaker notes and the three built-in themes. PPT editing uses title/body layouts; text beyond the visible layout should be shortened before presentation/export. Spreadsheet formulas are limited to the listed functions and same-sheet references, including absolute and mixed references such as `$A$1`, `$A1` and `A$1`. Formula copy/fill adjustment is not implemented. Spreadsheet formatting, charts, cross-sheet references, file sharing, real-time collaboration, and version history are not included.

Files are limited to 10 MB on import, 4 MB of normalized content, 20 worksheets with 500 rows × 52 columns each, and 100 slides. ZIP expansion is bounded. Unsupported spreadsheet dimensions fail explicitly rather than being silently truncated.

Multi-cell spreadsheet paste is atomic: exceeding worksheet bounds or the 10,000-character cell limit rejects the entire paste with an explanation, leaving existing cells unchanged.

The quota is **3,000,000,000 bytes**, measured as UTF-8 bytes of the persisted native document content, including trash. Metadata, SQLite indexes, and transient exported files do not count. Original Office files are converted rather than charged by their upload size. Permanent deletion releases the document's quota; SQLite may reuse freed database pages without shrinking its file immediately.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit/API tests use isolated in-memory databases. Browser tests create disposable accounts in `test-results/e2e-db` and test all three editors, reload persistence, exports, search, stars, trash/restore, conflicts, and mobile overflow. Screenshots and failure traces are under `test-results/` and are not committed.

## Hosting

The web application is deployed on Cloudflare at [卓乐云文档](https://wpx.youdroid.top). See [Operations](docs/operations.md) and the recorded checks in [Verification](docs/verification.md) for deployment and recovery boundaries. A local development server stores data only on its host.

## Desktop client (phase two)

The Electron client bundles the editors locally and connects to the same cloud API. It includes native file open/save, menus and keyboard shortcuts, a validated service connection screen, and per-account local drafts. Cached documents remain editable offline. Drafts survive process restarts, synchronize when the library reconnects, and never overwrite a newer cloud revision; conflicts can be saved as a separate cloud copy.

```sh
npm run desktop:build
npm run desktop:dev
npm run desktop:pack:mac
npm run desktop:pack:win
npm run test:desktop
```

On first launch, the service form pre-fills `https://wpx.youdroid.top` and validates it before connecting. A custom HTTPS root or the loopback development service `http://127.0.0.1:3173` is also accepted. Custom servers must allow their browser-facing origin through `APP_ORIGIN`.

See [Delivery status](docs/delivery-status.md) for the requirement-by-requirement acceptance boundary. See [Desktop delivery](docs/desktop.md) for artifact locations, platform validation, signing boundaries, and offline behavior.

Official desktop installers for version 0.1.6:

| Platform            | Download                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------- |
| macOS Apple Silicon | [DMG](https://wpx.youdroid.top/downloads/desktop/0.1.6/ZhuoleDocs-0.1.6-mac-arm64.dmg)       |
| macOS Intel         | [DMG](https://wpx.youdroid.top/downloads/desktop/0.1.6/ZhuoleDocs-0.1.6-mac-x64.dmg)         |
| Windows x64         | [Installer](https://wpx.youdroid.top/downloads/desktop/0.1.6/ZhuoleDocs-0.1.6-win-x64.exe)   |
| Windows ARM64       | [Installer](https://wpx.youdroid.top/downloads/desktop/0.1.6/ZhuoleDocs-0.1.6-win-arm64.exe) |

Mac installers are Developer ID signed and notarized. Windows installers are unsigned by owner decision. Release filenames, sizes and SHA-256 checksums are available in the [public release manifest](https://wpx.youdroid.top/api/releases/desktop).

## Roadmap and structure

- **Phase 1 / WPX-1:** 卓乐云文档 Web MVP.
- **Phase 2 / WPX-2:** 卓乐文档 for Windows and macOS; native file integration, offline editing/sync, signed installers and updates.
- **Phase 3 / WPX-3:** iOS, Android and HarmonyOS clients; touch editing, system files/share integration and offline sync. Mobile distribution is deferred by the owner.

Desktop 0.1.6 installers are publicly available with manual update checking; platform-specific acceptance limits remain in the delivery report. Mobile delivery is in progress, with local Android 0.1.4, iOS 0.1.4 and HarmonyOS 0.1.3 candidates. iOS, Android and HarmonyOS projects bundle the editors and native cloud/file adapters; see [Mobile clients](docs/mobile.md). They reuse the account, quota, and document API. See [Architecture](docs/architecture.md) for the implementation boundaries.

For local mobile installation, run from the repository root:

```sh
./run_release.sh
```

Choose the platform, device and Debug/Release mode from the interactive menus. The launcher builds, installs and starts the app; Release selects an optimized local build and does not publish it. Use `./run_release.sh --help` for explicit selection and dry-run options. Toolchain and development-signing prerequisites are documented in [Mobile clients](docs/mobile.md).

```text
desktop/             Sandboxed Electron main process, preload and packaging assets
src/                 React workspace, editors and local draft synchronization
server/              Express API, sessions, SQLite persistence, Office conversion
shared/              Version-one document models and bounded formula parser
tests/               Unit, API and Playwright acceptance tests
docs/                Architecture, phase roadmap and hosting instructions
```
