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
- Cloud library: multi-level folders (create, rename, move, delete), create, search, type filters, sorting, list/grid views, rename, star, trash, restore, permanent delete, and storage accounting.
- Web entry: a landing page with desktop installer downloads; mobile store links remain placeholders.
- Word: WPS-style ribbon (Home / Insert / Page / Review / View) embedded in the editor header. Headings, bold/italic/underline/strike, sub/superscript, font family, text color, highlight, alignment, bullet/ordered/task lists, quotes, tables with a grid picker, images, symbols, table of contents from headings, find/replace, word count, undo/redo, and automatic saving. **Known defect:** the shared content schema does not yet accept the font family, text color, highlight, sub/superscript, image and task-list content these ribbon controls produce, so the server rejects saves of documents that use them. On narrow and native mobile screens, a reflow view and a bottom accessory toolbar replace the fixed A4 page.
- Excel: five-tab WPS-style ribbon (Home / Insert / Data / Formula / View). Rectangular range selection, Shift expansion, row/column selection, range copy/cut/paste/clear and statistics; relative formula/style copy and directional fill with absolute/mixed-reference locks; draggable fill handle with arithmetic numeric sequences, preview, cancellation and edge scrolling; insert/delete rows and columns with reference adjustment; draggable row/column sizing; worksheet rename/copy/delete; session undo/redo; frozen rows and columns with XLSX view roundtrip; range font, bold/italic/underline, text/fill colors, alignment, directional/perimeter borders, number/percent/CNY formats and clear formatting, with basic XLSX style roundtrip; sorting and duplicate removal; cell comments, data validation with in-cell dropdown lists, and AutoFilter, all with XLSX roundtrip; hyperlink/checkbox/symbol insertion and CSV text import; cell input, TSV paste, references, arithmetic, `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, and cycle/error reporting. Touch selection activates a cell without opening the software keyboard; fill and resize handles have enlarged touch targets.
- PPT: WPS-style ribbon (Home / Insert / Design / Transitions / View / Slide Show). Slides, duplicate, reorder, eight layouts, themes and background colors, 16:9 or 4:3 ratio, freeform text boxes, shapes, icons, images, tables and charts with layering, slide transitions, speaker notes, and presentation mode with keyboard and swipe navigation. Elements support touch dragging and resizing.
- Download as DOCX, XLSX, or PPTX; import basic content from these formats. Native `.zdoc` backup/import preserves the complete supported model.
- Autosave is serialized and revision-checked. A stale edit receives HTTP 409 and stays in the browser with an explicit local-backup action.
- Responsive workspace, sign-in pages and editor headers; mobile-specific editor adaptations are listed above.

## Explicit MVP boundaries

This is a functioning basic editor suite, not full WPS/Office parity. Office import is a **conversion**, and the original upload is not retained. The import dialog discloses loss of complex layout, images, charts, and animations. Keep original Office files.

**Office export covers less than the editors.** Only the native `.zdoc` backup preserves everything listed above.

- DOCX export writes paragraphs, headings, alignment, lists (simplified), quotes, rectangular tables and bold/italic/underline/strike. Images, font family, text color, highlight, sub/superscript and task lists cannot currently be saved (see the Word defect above) and are not exported. Hyperlinks are simplified.
- PPTX export writes each slide's title, body, background color, theme colors and speaker notes. Freeform elements (text boxes, shapes, icons, images, tables, charts), non-title layouts and transitions are not exported yet.
- XLSX export covers values, formulas, basic styles, frozen panes, row/column sizes, comments, data validation and AutoFilter. Spreadsheet chart previews are not saved in the document.

Word import preserves basic paragraphs, headings, rectangular tables, whitespace, breaks and explicit bold/italic/underline/strike formatting; nested tables are rejected. PPT import preserves basic title/body text, speaker notes and the three built-in themes. Spreadsheet formulas are limited to the listed functions and same-sheet references, including absolute and mixed references such as `$A$1`, `$A1` and `A$1`. Spreadsheet image, pivot table, text box, watermark and QR code entries in the ribbon only explain that they are not available. Merged cells, cross-sheet references, file sharing, real-time collaboration, version history, password recovery and email verification are not included.

Files are limited to 10 MB on import, 4 MB of normalized content, 20 worksheets with 500 rows × 52 columns each, and 100 slides. ZIP expansion is bounded. Unsupported spreadsheet dimensions fail explicitly rather than being silently truncated.

Select cells with a click or drag, extend with Shift, and edit with a double-click, F2, direct typing or the formula bar. The address box accepts ranges such as `A1:C10`. Row/column insertion rejects operations that would discard occupied edge cells; deletion adjusts supported same-sheet references and marks deleted references as `#REF!`. Row heights and column widths persist in native documents and XLSX conversion. Undo/redo covers the current editor session and is not version history. Internal copy/paste adjusts relative references; cut and external text paste keep formula text unchanged.

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

Desktop 0.1.6 installers are publicly available with manual update checking; they predate the 2026-10-15 to 2026-10-20 editor work (ribbons, folders, presentation suite, mobile adaptations). Platform-specific acceptance limits remain in the delivery report. Mobile delivery is in progress, with local Android 0.1.4, iOS 0.1.4 and HarmonyOS 0.1.3 packages; the 2026-10-20 touch and reflow changes are synced into the native projects but not yet packaged or device-verified. iOS, Android and HarmonyOS projects bundle the editors and native cloud/file adapters; see [Mobile clients](docs/mobile.md). They reuse the account, quota, and document API. See [Architecture](docs/architecture.md) for the implementation boundaries.

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
