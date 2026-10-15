import type { SheetCellStyle, SheetPage } from '../../../shared/documents';
import type { SheetSelection } from '../../../shared/sheet-selection';

export type RibbonTab = 'home' | 'insert' | 'data' | 'formula' | 'view';

export interface ViewSettings {
  eyeCare: boolean;
  highlightRowCol: boolean;
  showGridlines: boolean;
  showHeadings: boolean;
  zebraStripe: boolean;
  zoom: number; // 50, 75, 100, 125, 150
}

export interface SheetRibbonProps {
  currentTab: RibbonTab;
  onTabChange: (tab: RibbonTab) => void;
  // Cell styles & formatting
  currentStyle: SheetCellStyle;
  onStyleChange: (patch: SheetCellStyle) => void;
  onClearContent: () => void;
  onClearFormat: () => void;
  // History
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // Fill & Clipboard
  onFill: (direction: 'down' | 'right') => void;
  canFillDown: boolean;
  canFillRight: boolean;
  // Structure
  onStructure: (axis: 'row' | 'col', operation: 'insert' | 'delete') => void;
  columnWidth: string;
  onColumnWidthChange: (val: string) => void;
  onApplyColumnWidth: () => void;
  rowHeight: string;
  onRowHeightChange: (val: string) => void;
  onApplyRowHeight: () => void;
  // Freeze
  frozenRows: number;
  frozenColumns: number;
  onFreeze: (mode: string) => void;
  canFreezeSelection: boolean;
  // Sort & Filter
  onSort: (direction: 'asc' | 'desc') => void;
  // Formula
  onInsertFormula: (formulaName: string) => void;
  // View Settings
  viewSettings: ViewSettings;
  onViewSettingsChange: (settings: Partial<ViewSettings>) => void;
  // Add capacity
  onAddRows: () => void;
  onAddCols: () => void;
  canAddRows: boolean;
  canAddCols: boolean;
  // Modal triggers / search
  onOpenFindReplace: () => void;
  onOpenInsertDialog: (type: 'checkbox' | 'dropdown' | 'link' | 'image' | 'chart' | 'pivot') => void;
}
