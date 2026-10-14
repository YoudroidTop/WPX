# Web spreadsheet selection and structure acceptance

Date: 2026-10-14. Requirement: WPX-13. Reference: the owner's open WPS Web workbook, observed without editing its contents.

## Delivered behavior

- Click/drag rectangular selection, Shift-click and Shift-arrow expansion, row/column/all selection, and address-box navigation.
- Separate selection and editing: double-click/F2/direct typing/formula bar; Enter/Tab/arrow navigation. Native touch retains direct editing.
- Copy/cut/paste, clear selected contents, and count/sum/average from calculated values.
- Insert/delete selected rows or columns. Same-sheet references (including absolute/mixed references) move with structure; ranges shrink on deletion and removed references become `#REF!`. Insertion rejects occupied cells pushed beyond the existing bounds.
- Apply row heights/column widths to selections or drag header boundaries. Optional dimensions survive native validation/storage and XLSX conversion.
- Rename, duplicate and delete worksheets; prevent deleting the last worksheet and reject duplicate/invalid names.
- Up to 100 local editor-session undo/redo snapshots, including structural edits and worksheet deletion. This is not persistent version history.

## Evidence

- `releases/qa/sheet-web-tests.log`: all 123 unit/API tests pass, including seven new selection/structure tests.
- `releases/cloudflare/sheet-build.log`: staged TypeScript, Vite and Worker dry-run pass.
- Native browser CUA on the real SheetEditor component: drag A1:C2, Shift extension through C3, copy/paste formula text, Delete, direct typing/Enter, double-click formula editing, full-column selection, insertion/reference adjustment, undo, duplicate/rename/delete/undo worksheet, numeric dimensions and header-boundary drag all passed. Actual input sizes changed by the expected deltas.
- `releases/qa/web-sheet-selection.png`: local selection and resized grid.
- `releases/qa/sheet-production-readback.json`: production optional-dimension persistence and XLSX dimensions/formula cache.
- `releases/qa/sheet-ui-save-readback.json`: production browser insertion persisted A2=120 and C2=`=SUM(A2:B2)`, 48px row height and 215px column width.
- `releases/qa/web-sheet-production.png`: final deployed editor, reopened saved document and selected A2:C3. Formula result 200 and dimension controls 215/48 verified after refresh.
- `releases/cloudflare/sheet-api-smoke.log`: production accounts, Word/Excel/PPT export, stale-write rejection and fixture cleanup passed.
- `releases/qa/sheet-final-verification.json`: dedicated UI fixture cleanup and byte-exact live assets.

## Deployment boundary

Final Worker: `c7b630eb-f5af-429d-be40-4fa5637e89a0`, on `https://wpx.youdroid.top`. Previous production rollback: `7470c438-1f90-4a43-89c6-019843a4ed74`. An intermediate version `1defe8de-4e1c-4dfe-a9b3-0d38797b1ea7` was replaced to make dimension controls reflect the active cell's stored dimensions.

Deployment uses the existing production staging snapshot plus the seven scoped editor/model/Office files listed in `releases/cloudflare/sheet-stage-source.json`. Worker routing, storage implementation, bindings, migrations and desktop manifests remain unchanged. No customer data migration or restore. Desktop/mobile installers were not refreshed.

## Remaining scope

This is the selection/structure increment, not complete WPS parity. Relative formula adjustment during copy/fill, cross-sheet formulas, cell styling, sorting/filtering, freezing panes and persistent history are not delivered. Existing 500-row/52-column/20-sheet limits remain. Full native-device and Chinese IME regression was not rerun; this acceptance targets Web. The existing end-to-end test source now enters editing explicitly, but the CLI browser suite was not run; actual UI acceptance used CUA.
