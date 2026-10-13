# Delivery verification

Verified locally on 2026-10-13 using Node.js 24.19.0.

## Automated results

- `npm test`: 9 tests passed. Coverage includes account isolation, CSRF, password hashing/rotation/logout, stale/concurrent writes, byte-exact quota and trash accounting, formula evaluation/errors, unsafe input validation, bounded ZIP imports, OOXML export/import, native backups, and malformed/deep document trees.
- `npm run build`: TypeScript checking and Vite production build passed. The rich-text editor is a separate lazy-loaded chunk.
- `npm run test:e2e`: 4 Chromium scenarios passed. Coverage includes creating/editing all three document kinds, saving/reopening, Office downloads, search/star/trash/restore, conflict backup, native import, rich-text table persistence, renaming, profile edits, logout, and mobile layout overflow.
- `npm run format:check`: passed.
- `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org`: zero known vulnerabilities. Scoped overrides upgrade ExcelJS's UUID dependency and PptxGenJS's image-size dependency; Office round-trip tests pass with these versions.

## Visual inspection

Reviewed generated screenshots of the 1440 px workspace, 390 px workspace, desktop login, and slide editor. Content is visible after transitions, mobile navigation retracts correctly, and the workspace has no horizontal page overflow. Browser tests also captured Word and spreadsheet editor screenshots.

Screenshots are generated under `test-results/` and excluded from Git. Test accounts belong to a separate disposable test database; they are not bundled in the user application.

## Limits of this evidence

The checks establish a local web MVP. They do not establish production deployment, multi-user load capacity, complete Office format fidelity, screen-reader certification, desktop installer delivery, mobile native delivery, or physical-device acceptance. Public hosting still needs HTTPS, trusted proxy configuration, persistent storage, backups, and operational validation.

## Phase-two desktop checkpoint

Implemented Electron clients with bundled editors, native menus and file dialogs, server configuration, account-scoped offline drafts, reconnect synchronization, conflict-copy recovery, and native ZDOC file-open handling.

- `npm run desktop:build`: TypeScript, Vite, and Electron main/preload bundling passed.
- `npm run test:desktop`: six Electron scenarios passed, including native disk backup, offline persistence across process restart, conflict recovery from the draft list, account switching/offline logout, startup file arguments, and a packaged macOS launch. Dialog selections are deterministic test substitutions; actual IPC reads/writes are exercised.
- The nine API/model tests and four web regression scenarios passed with the desktop integration.
- macOS arm64/x64 DMG and ZIP artifacts and Windows x64/arm64 NSIS artifacts were generated under `releases/desktop/`. Both macOS application bundles passed `codesign --verify --deep --strict` with ad-hoc signatures. Windows executables are unsigned; PE headers identify x64 and ARM64 respectively.
- Packaged Apple Silicon macOS UI was actually launched and inspected. Windows and Intel macOS runtime acceptance remain unverified.
- ASAR payloads contain only main/preload code, bundled web assets, and package metadata, with no API server or node_modules directory. Build staging removes only its generated web directory before copying assets, preventing stale hashed bundles from accumulating.
- Production dependency audit: zero known vulnerabilities. The development toolchain audit reports eight moderate findings in the electron-builder download/logging dependency chain; these dependencies are not included in the application payload.

Desktop screenshots are `test-results/desktop-offline.png`, `test-results/desktop-workspace.png`, and `test-results/desktop-packaged.png`. Installer SHA-256 checksums are written beside the generated artifacts in `releases/desktop/SHA256SUMS`.

This is a local desktop development delivery, not a signed public release. Developer ID/notarization, Windows code signing, a verified update distribution service, public cloud deployment, and Windows native installation/runtime checks remain open. Mobile clients have not yet been delivered.
