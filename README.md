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

This is a functioning basic editor suite, not full WPS/Office parity. Office import is a **conversion**, and the original upload is not retained. The import dialog discloses loss of complex layout, images, charts, and animations. Keep original Office files. Word import currently extracts top-level paragraphs, headings, and basic bold/italic runs; Word list semantics and hyperlinks are simplified during export. PPT editing uses title/body layouts; text beyond the visible layout should be shortened before presentation/export. Spreadsheet formulas are limited to the listed functions and same-sheet references. Spreadsheet formatting, charts, cross-sheet references, file sharing, real-time collaboration, and version history are not included.

Files are limited to 10 MB on import, 4 MB of normalized content, 20 worksheets with 500 rows × 52 columns each, and 100 slides. ZIP expansion is bounded. Unsupported spreadsheet dimensions fail explicitly rather than being silently truncated.

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

The application has not been deployed to a production server. See [Operations](docs/operations.md) before hosting it. A server deployment makes accounts and storage available across browsers; the local development server stores data only on its host.

## Desktop client (phase two, in progress)

The Electron client bundles the editors locally and connects to the same cloud API. It includes native file open/save, menus and keyboard shortcuts, a validated service connection screen, and per-account local drafts. Cached documents remain editable offline. Drafts survive process restarts, synchronize when the library reconnects, and never overwrite a newer cloud revision; conflicts can be saved as a separate cloud copy.

```sh
npm run desktop:build
npm run desktop:dev
npm run desktop:pack:mac
npm run desktop:pack:win
npm run test:desktop
```

On first launch, connect to a running Zhuole Cloud Docs server using its HTTPS root URL. For local development, `http://127.0.0.1:3173` is accepted. The client does not invent or ship a public cloud endpoint. The server must allow its browser-facing origin through `APP_ORIGIN`.

See [Desktop delivery](docs/desktop.md) for artifact locations, platform validation, signing boundaries, and offline behavior.

## Roadmap and structure

- **Phase 1 / WPX-1:** 卓乐云文档 Web MVP.
- **Phase 2 / WPX-2:** 卓乐文档 for Windows and macOS; native file integration, offline editing/sync, signed installers and updates.
- **Phase 3 / WPX-3:** mobile clients; touch editing, system files/share integration, offline sync, store distribution.

Desktop delivery is in progress; the mobile phase remains in the backlog. They will reuse the account, quota, and document API. See [Architecture](docs/architecture.md) for the implementation boundaries.

```text
desktop/             Sandboxed Electron main process, preload and packaging assets
src/                 React workspace, editors and local draft synchronization
server/              Express API, sessions, SQLite persistence, Office conversion
shared/              Version-one document models and bounded formula parser
tests/               Unit, API and Playwright acceptance tests
docs/                Architecture, phase roadmap and hosting instructions
```
