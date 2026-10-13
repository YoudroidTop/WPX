# Phase-one verification

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
