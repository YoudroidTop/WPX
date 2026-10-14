# Web spreadsheet drag autofill acceptance

Date: 2026-10-14. Requirement: WPX-17.

## Behavior

The selected rectangle has a bottom-right fill handle. Dragging extends one dominant axis with a visual range preview, then commits the result as one undoable edit on release. The source rectangle remains unchanged. Escape, pointer cancellation, lost capture or window blur cancels the gesture. Only the primary pointer starts a gesture.

Two or more canonical decimal numbers with a constant step extend an arithmetic sequence; one number or irregular/text data repeats the source block. Leading-zero identifiers remain text patterns. Formula references shift using existing absolute/mixed-lock rules and styles repeat with their source cells. Reverse filling is supported. Numeric overflow and invalid target rectangles fail without mutating the original document.

Holding the pointer at a scroll viewport edge scrolls the current rendered grid. It does not automatically allocate additional rows/columns beyond that grid; the existing add-row/add-column controls remain available. Date sequences, inferred text suffixes and multi-axis expansion are not implemented.

## Evidence

- `releases/qa/sheet-autofill-tests.log`: 138 unit/API tests pass. New tests cover axis selection, reverse/decimal sequences, leading-zero text, irregular source blocks, formulas/styles and atomic overflow rejection.
- `releases/cloudflare/sheet-autofill-build.log`: staged TypeScript/Vite/Worker build passes. Final built asset contains the primary-pointer guard and is newer than the copied hook source.
- CUA real editor: drag A1:A2 (1,2) through A7 produces 7 and expands the selection. Drag C1 through C7 produces `=SUM(A7:B7)` and result 7; undo removes the target formula and redo restores it.
- CUA ordinary pointer input through the tab CDP capability: while holding the handle over A10, A10 is in the preview but still blank. Escape clears the preview, A10 stays blank, and selection remains A1:A2.
- Holding at the bottom edge scrolls from 0 to 126px, then to the bottom (1044.5px) while held. Release commits A1:A50 with A50=50; one undo reverses this operation.
- After the final primary-pointer guard, an additional native drag to A9 produces 9.
- `releases/qa/web-sheet-autofill.png`: local grid evidence.

Native app installers and full touch-device acceptance are outside this Web increment.

## Production

Worker `3e002d58-f7c2-4522-a1a3-fdfbe6211177`; rollback predecessor `25073efa-d84e-47dc-bec4-01a83f460f95`. Only the fill module, drag hook, editor and stylesheet were copied into the existing isolated production stage. Storage/routes/configuration and document format are unchanged.

- CUA dragged A1:A2 (1,2) to A7; B1 (`=A1*10`) to B7; D3:D4 (3,5) upward to D1. Saved, refreshed and reopened: A7=7, B7=`=A7*10` with result 70, D1=-1 and D2=1. Styles persist.
- `releases/qa/web-sheet-autofill-production.png`: reopened production document.
- `releases/qa/sheet-autofill-ui-readback.json`: independent API verification of UI-created sequence, formulas, reverse extension and styles. Cleanup script also checks XLSX B7 formula, cached result 70 and bold style before deleting the fixture.
- `releases/qa/sheet-autofill-final-verification.json`: isolated fixture cleanup, zero remaining account usage and seven live assets matching the staged build byte-for-byte. Browser logout was visibly verified.
