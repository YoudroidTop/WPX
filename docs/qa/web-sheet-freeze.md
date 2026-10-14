# Web spreadsheet frozen panes acceptance

Date: 2026-10-14. Requirement: WPX-15.

## Behavior

- Freeze first row, first column, or all rows above and columns left of the active cell. Cancel freezing from the same menu.
- Frozen metadata is worksheet-specific, optional for old documents, and included in native backups and XLSX frozen views.
- Custom row heights and column widths define sticky offsets. Frozen intersections, row headings and column headings have separate stacking levels.
- Structural insertion/deletion before the frozen boundary adjusts it. Existing worksheet duplication and session undo/redo retain the metadata.
- Freeze changes reset scrolling to the origin. Keyboard/address navigation accounts for frozen pane padding.

## Evidence

- `releases/qa/sheet-freeze-tests.log`: 129 unit/API tests passed. New coverage includes custom-size offsets, structural boundary movement/clamping, invalid metadata and native/XLSX roundtrips for row-only, column-only and combined views.
- `releases/cloudflare/sheet-freeze-build.log`: staged TypeScript/Vite/Worker dry-run passed.
- CUA on the real editor component: set A:B width 180 and rows 1:2 height 48; freeze at C3; navigate to L40. Scroll offsets became left=338/top=789.5 while A1 remained at x=44/y=219.5. Screenshot confirms both frozen panes remain visible and other rows/columns scroll underneath without showing through the frozen cells.
- Cancel removes sticky positioning; undo restores the combined view. Inserting a row at A1 changes the boundary from 2 rows/2 columns to 3 rows/2 columns, then undo restores it. First-row and first-column menu actions report 1/0 and 0/1 respectively.
- `releases/qa/web-sheet-freeze.png`: local combined-pane scrolling evidence.

## Scope

Web acceptance only; native installers are not rebuilt. This is frozen panes, not independent split-view scrolling. The existing 500-row/52-column bounds remain; freeze metadata leaves at least one unfrozen row and column. Very large frozen regions can occupy most of the viewport; the toolbar remains available to cancel freezing.

## Production

Worker `7e000ac1-92cb-4e0f-ac12-e7801ed9451e`; rollback predecessor `0290a9ec-a42c-4fdd-b083-dbfa2778b987`. The isolated production stage received only the six view/model/editor/Office files; routing/storage/config remained identical to the production base. No migration and no native installer refresh.

- `releases/qa/sheet-freeze-readback.json`: API save/reload preserves 2 rows/2 columns and exported XLSX view reports `frozen`, xSplit=2, ySplit=2.
- CUA changed the boundary to 2 rows/1 column, saved, refreshed and reopened. The toolbar retained the new values. Navigating to L40 scrolled left=338/top=854.5 while A1 remained at x=44/y=285.5.
- `releases/qa/web-sheet-freeze-production.png`: refreshed production combined-pane scrolling.
- `releases/qa/sheet-freeze-ui-readback.json`: independent API verification of the UI-applied boundary.
- `releases/qa/sheet-freeze-final-verification.json`: dedicated synthetic document cleanup, zero remaining account usage and byte-exact live assets. Browser logout was visibly verified before closing the temporary tab.
