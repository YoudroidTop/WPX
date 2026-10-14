# Web spreadsheet formula copy and fill acceptance

Date: 2026-10-14. Requirement: WPX-16.

## Behavior

- Internal range copy adds a validated, bounded custom clipboard payload alongside plain TSV. Pasting it outside cell text editing shifts same-sheet relative references and copies cell styles. Absolute and mixed locks stay fixed on their locked axes.
- Down/right fill copies the first row/column of the selection. Blank source cells clear destination contents; absent source styles clear destination styles. Operations read immutable snapshots, so overlapping source/destination ranges do not cascade.
- Formula references shifted outside supported sheet bounds become `#REF!`. A destination rectangle or expanded formula exceeding bounds is rejected without changing the source document.
- Fill is available through toolbar buttons and Ctrl/Command D or R while the grid is selected. Each operation uses existing session undo/redo and cloud saving.

External plain text remains TSV. When the browser does not preserve the custom clipboard type, paste falls back to TSV without relative adjustment or styles. Cut retains its prior literal-formula behavior. Cross-sheet formulas, series inference and a draggable fill handle are not part of this increment.

## Evidence

- `releases/qa/sheet-fill-tests.log`: 133 unit/API tests pass. New tests cover locks, ranges, quoted strings, error references, boundaries, overlapping snapshots, styles/blank sources, atomic length rejection and malformed clipboard payloads.
- `releases/cloudflare/sheet-fill-build.log`: staged TypeScript/Vite/Worker dry-run pass.
- CUA on the real editor: copy A1:C1 to A4, then inspect C4. Formula becomes `=SUM(A4:B4)`, result 200, and bold/fill styles are preserved. Fill A4:C7 downward gives C7 `=SUM(A7:B7)` and result 200. Undo clears the new target rows, and Command-D restores the filled result.
- Right fill of E1:G1 from `=$A1+B$1+$A$1` gives G1 `=$A1+D$1+$A$1`, result 240.
- `releases/qa/web-sheet-fill.png`: local fill and mixed-reference evidence.

## Production

Worker `25073efa-d84e-47dc-bec4-01a83f460f95`; rollback predecessor `7e000ac1-92cb-4e0f-ac12-e7801ed9451e`. The existing isolated production stage received the editor and two pure clipboard/fill modules only. Storage, routes, configuration and data format are unchanged. Native installers were not refreshed.

- CUA copied A1:C1 to A4, filled A4:C7 downward and E1:G1 rightward, saved, refreshed and reopened. C7 retained `=SUM(A7:B7)` with result 200; G1 retained `=$A1+D$1+$A$1`; destination bold/fill styles survived.
- `releases/qa/web-sheet-fill-production.png`: refreshed production values and copied styles.
- `releases/qa/sheet-fill-ui-readback.json`: independent API readback of the UI-created formulas and styles. Cleanup script also checks exported C7 formula, cached result 200 and bold font before deletion.
- `releases/qa/sheet-fill-final-verification.json`: synthetic fixture cleanup, zero remaining account usage and seven byte-exact live assets. Browser logout was verified before closing the temporary tab.

The initial fixture script incorrectly assumed every workbook had a frozen view; that evidence-only assertion was removed and the same retained fixture was reused successfully. No additional account was created by the retry.
