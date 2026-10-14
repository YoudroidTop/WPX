# Web spreadsheet formatting acceptance

Date: 2026-10-14. Requirement: WPX-14.

## Delivered

Selection formatting supports bold, italic, underline, RGB text/fill colors, horizontal alignment, all-cell borders, and general/number/percent/CNY display. Clear formatting preserves values. Formatting preserves raw values and formulas, moves with structural edits (including styled blank cells), and participates in existing worksheet duplication and session undo/redo. Optional validated metadata preserves compatibility when loading older documents.

Basic RGB styles and the supported number formats round-trip through XLSX and native content validation. Theme colors, arbitrary custom number formats, conditional formatting and partial/custom borders are not implemented. Existing desktop/mobile installers are not refreshed; this acceptance targets the Web client.

## Evidence

- `releases/qa/sheet-format-tests.log`: 126 unit/API tests passed, including range immutability/clear behavior, formatted-empty-cell structural movement/edge protection, and XLSX style/value/formula roundtrip.
- `releases/cloudflare/sheet-format-build.log`: staged TypeScript, Vite and Worker dry-run pass.
- CUA real-component acceptance: A1:C2 bold, centered and currency display; fill; borders; insert rows preserves formatted formula result 200; undo restores; double-click exposes original formula; clear formatting and undo restore presentation. Color input uses the input event after an initial automation check exposed missing updates.
- `releases/qa/web-sheet-format.png`: local format and selection rendering. Selection edges remain visible over cell fill.
- `releases/qa/sheet-format-readback.json`: production schema persistence and exported XLSX styles.
- `releases/qa/web-sheet-format-production.png`: production browser, reopened after refresh. UI-applied italic and blue text persisted, alongside existing fill and currency display.
- `releases/qa/sheet-format-ui-readback.json`: API readback of the UI-applied styles.
- `releases/qa/sheet-format-smoke.log`: broader production smoke passed account/session and Word checks, then stopped on an IPv6 connection timeout; it is not an all-three-editor smoke pass. The formatting-specific readback and cleanup/asset comparison passed, with the latter retried using IPv4-first DNS.
- `releases/qa/sheet-format-final-verification.json`: current isolated fixture cleanup and exact live asset comparison.

## Deployment

Worker `0290a9ec-a42c-4fdd-b083-dbfa2778b987`, domain `https://wpx.youdroid.top`. Rollback predecessor `c7b630eb-f5af-429d-be40-4fa5637e89a0`.

Deployment used the existing isolated production stage with only editor/style/model/Office files copied. Routing, storage and Wrangler config were verified unchanged against the production base. No database migration.

The first API check immediately after deployment returned content without styles. A subsequent independent fixture passed persistence/export and browser refresh checks. This is consistent with deployment propagation, not proven as a root cause. The first script exited before retaining its randomly generated credentials; that synthetic account/document could not be cleaned up through its authenticated API. It contains only generated QA data. The script now retains fixture identity before assertions; the successful fixture is separately cleaned and verified.
