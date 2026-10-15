import React, { useState } from 'react';
import {
  Undo,
  Redo,
  Paintbrush,
  Scissors,
  Copy,
  Eraser,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  DollarSign,
  Percent,
  Plus,
  Trash2,
  Filter,
  ArrowDownUp,
  Search,
  Sigma,
  Table,
  CheckSquare,
  ListFilter,
  Image,
  BarChart2,
  PieChart,
  LineChart,
  Link,
  MessageSquare,
  Eye,
  Grid,
  Maximize2,
  ZoomIn,
  Split,
  Binary,
  Layers,
  Calculator,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { SheetRibbonProps, RibbonTab } from './types';

export default function SheetRibbon({
  currentTab,
  onTabChange,
  currentStyle,
  onStyleChange,
  onClearContent,
  onClearFormat,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFill,
  canFillDown,
  canFillRight,
  onStructure,
  columnWidth,
  onColumnWidthChange,
  onApplyColumnWidth,
  rowHeight,
  onRowHeightChange,
  onApplyRowHeight,
  frozenRows,
  frozenColumns,
  onFreeze,
  canFreezeSelection,
  onSort,
  onInsertFormula,
  viewSettings,
  onViewSettingsChange,
  onAddRows,
  onAddCols,
  canAddRows,
  canAddCols,
  onOpenFindReplace,
  onOpenInsertDialog,
}: SheetRibbonProps) {
  const [formatBrushActive, setFormatBrushActive] = useState(false);

  return (
    <div className="sheet-ribbon">
      {/* Tab Headers */}
      <div className="ribbon-tabs">
        <button
          className={`ribbon-tab-btn ${currentTab === 'home' ? 'active' : ''}`}
          onClick={() => onTabChange('home')}
        >
          开始
        </button>
        <button
          className={`ribbon-tab-btn ${currentTab === 'insert' ? 'active' : ''}`}
          onClick={() => onTabChange('insert')}
        >
          插入
        </button>
        <button
          className={`ribbon-tab-btn ${currentTab === 'data' ? 'active' : ''}`}
          onClick={() => onTabChange('data')}
        >
          数据
        </button>
        <button
          className={`ribbon-tab-btn ${currentTab === 'formula' ? 'active' : ''}`}
          onClick={() => onTabChange('formula')}
        >
          公式
        </button>
        <button
          className={`ribbon-tab-btn ${currentTab === 'view' ? 'active' : ''}`}
          onClick={() => onTabChange('view')}
        >
          视图
        </button>
      </div>

      {/* Ribbon Content Bar */}
      <div className="ribbon-panel">
        {currentTab === 'home' && (
          <div className="ribbon-group-row">
            {/* 剪贴板与历史 */}
            <div className="ribbon-group">
              <button
                className="ribbon-icon-btn"
                title="撤销 (Ctrl+Z)"
                disabled={!canUndo}
                onClick={onUndo}
              >
                <Undo size={15} />
              </button>
              <button
                className="ribbon-icon-btn"
                title="重做 (Ctrl+Shift+Z)"
                disabled={!canRedo}
                onClick={onRedo}
              >
                <Redo size={15} />
              </button>
              <button
                className={`ribbon-icon-btn ${formatBrushActive ? 'active' : ''}`}
                title="格式刷"
                onClick={() => setFormatBrushActive(!formatBrushActive)}
              >
                <Paintbrush size={15} />
              </button>
              <button
                className="ribbon-icon-btn"
                title="清空选区内容 (Delete)"
                onClick={onClearContent}
              >
                <Eraser size={15} />
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 字体与样式 */}
            <div className="ribbon-group">
              <button
                className={`ribbon-icon-btn ${currentStyle.bold ? 'active' : ''}`}
                title="加粗 (Ctrl+B)"
                onClick={() => onStyleChange({ bold: !currentStyle.bold })}
              >
                <Bold size={15} />
              </button>
              <button
                className={`ribbon-icon-btn ${currentStyle.italic ? 'active' : ''}`}
                title="斜体 (Ctrl+I)"
                onClick={() => onStyleChange({ italic: !currentStyle.italic })}
              >
                <Italic size={15} />
              </button>
              <button
                className={`ribbon-icon-btn ${currentStyle.underline ? 'active' : ''}`}
                title="下划线 (Ctrl+U)"
                onClick={() => onStyleChange({ underline: !currentStyle.underline })}
              >
                <Underline size={15} />
              </button>
              <button
                className={`ribbon-icon-btn ${currentStyle.border ? 'active' : ''}`}
                title="全边框"
                onClick={() => onStyleChange({ border: !currentStyle.border })}
              >
                <Grid size={15} />
              </button>

              <label className="ribbon-color-picker" title="文字颜色">
                <span className="color-indicator" style={{ color: currentStyle.color ?? '#2b382f' }}>
                  A
                </span>
                <input
                  type="color"
                  value={currentStyle.color ?? '#2b382f'}
                  onChange={(e) => onStyleChange({ color: e.target.value })}
                />
              </label>

              <label className="ribbon-color-picker" title="单元格填充背景">
                <span
                  className="fill-indicator"
                  style={{ backgroundColor: currentStyle.fill ?? '#e9f1e8' }}
                />
                <input
                  type="color"
                  value={currentStyle.fill ?? '#ffffff'}
                  onChange={(e) => onStyleChange({ fill: e.target.value })}
                />
              </label>
            </div>

            <div className="ribbon-divider" />

            {/* 对齐方式 */}
            <div className="ribbon-group">
              <button
                className={`ribbon-icon-btn ${currentStyle.align === 'left' ? 'active' : ''}`}
                title="左对齐"
                onClick={() => onStyleChange({ align: 'left' })}
              >
                <AlignLeft size={15} />
              </button>
              <button
                className={`ribbon-icon-btn ${currentStyle.align === 'center' ? 'active' : ''}`}
                title="居中对齐"
                onClick={() => onStyleChange({ align: 'center' })}
              >
                <AlignCenter size={15} />
              </button>
              <button
                className={`ribbon-icon-btn ${currentStyle.align === 'right' ? 'active' : ''}`}
                title="右对齐"
                onClick={() => onStyleChange({ align: 'right' })}
              >
                <AlignRight size={15} />
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 数字格式 */}
            <div className="ribbon-group">
              <select
                className="ribbon-select"
                aria-label="数字格式"
                value={currentStyle.numberFormat ?? 'general'}
                onChange={(e) =>
                  onStyleChange({
                    numberFormat: e.target.value as
                      | 'general'
                      | 'number'
                      | 'percent'
                      | 'currency',
                  })
                }
              >
                <option value="general">常规</option>
                <option value="number">数字</option>
                <option value="currency">货币 (¥)</option>
                <option value="percent">百分比 (%)</option>
              </select>
              <button
                className="ribbon-icon-btn"
                title="设置为货币格式"
                onClick={() => onStyleChange({ numberFormat: 'currency' })}
              >
                <DollarSign size={14} />
              </button>
              <button
                className="ribbon-icon-btn"
                title="设置为百分比格式"
                onClick={() => onStyleChange({ numberFormat: 'percent' })}
              >
                <Percent size={14} />
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 排序与自动求和 */}
            <div className="ribbon-group">
              <select
                className="ribbon-select"
                aria-label="自动求和"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  ∑ 自动求和
                </option>
                <option value="SUM">求和 (SUM)</option>
                <option value="AVERAGE">平均值 (AVERAGE)</option>
                <option value="COUNT">计数 (COUNT)</option>
                <option value="MAX">最大值 (MAX)</option>
                <option value="MIN">最小值 (MIN)</option>
              </select>
              <button
                className="ribbon-btn"
                title="升序排列当前选区"
                onClick={() => onSort('asc')}
              >
                升序 ↑
              </button>
              <button
                className="ribbon-btn"
                title="降序排列当前选区"
                onClick={() => onSort('desc')}
              >
                降序 ↓
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 行列操作与尺寸 */}
            <div className="ribbon-group">
              <select
                className="ribbon-select"
                aria-label="行列操作"
                value=""
                onChange={(e) => {
                  const [axis, op] = e.target.value.split('-');
                  onStructure(axis as 'row' | 'col', op as 'insert' | 'delete');
                }}
              >
                <option value="" disabled>
                  插入 / 删除
                </option>
                <option value="row-insert">上方插入行</option>
                <option value="row-delete">删除选中行</option>
                <option value="col-insert">左侧插入列</option>
                <option value="col-delete">删除选中列</option>
              </select>
              <button
                className="ribbon-icon-btn"
                title="查找与替换 (Ctrl+F)"
                onClick={onOpenFindReplace}
              >
                <Search size={15} />
              </button>
            </div>
          </div>
        )}

        {currentTab === 'insert' && (
          <div className="ribbon-group-row">
            {/* 行列插入与删除 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn"
                onClick={() => onStructure('row', 'insert')}
              >
                上方插入行
              </button>
              <button
                className="ribbon-btn"
                onClick={() => onStructure('col', 'insert')}
              >
                左侧插入列
              </button>
              <button
                className="ribbon-btn text-danger"
                onClick={() => onStructure('row', 'delete')}
              >
                删除行
              </button>
              <button
                className="ribbon-btn text-danger"
                onClick={() => onStructure('col', 'delete')}
              >
                删除列
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 表格组件与交互 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn-icon"
                onClick={() => onOpenInsertDialog('checkbox')}
              >
                <CheckSquare size={14} />
                复选框
              </button>
              <button
                className="ribbon-btn-icon"
                onClick={() => onOpenInsertDialog('dropdown')}
              >
                <ListFilter size={14} />
                下拉列表
              </button>
              <button
                className="ribbon-btn-icon"
                onClick={() => onOpenInsertDialog('link')}
              >
                <Link size={14} />
                超链接
              </button>
              <button
                className="ribbon-btn-icon"
                onClick={() => onOpenInsertDialog('image')}
              >
                <Image size={14} />
                图片
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 统计图表 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn-icon"
                onClick={() => onOpenInsertDialog('chart')}
              >
                <BarChart2 size={14} />
                柱状图
              </button>
              <button
                className="ribbon-btn-icon"
                onClick={() => onOpenInsertDialog('chart')}
              >
                <LineChart size={14} />
                折线图
              </button>
              <button
                className="ribbon-btn-icon"
                onClick={() => onOpenInsertDialog('chart')}
              >
                <PieChart size={14} />
                饼图
              </button>
              <button
                className="ribbon-btn-icon"
                onClick={() => onOpenInsertDialog('pivot')}
              >
                <Table size={14} />
                数据透视表
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 扩充容量 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn"
                disabled={!canAddRows}
                onClick={onAddRows}
              >
                <Plus size={13} /> 50 行
              </button>
              <button
                className="ribbon-btn"
                disabled={!canAddCols}
                onClick={onAddCols}
              >
                <Plus size={13} /> 5 列
              </button>
            </div>
          </div>
        )}

        {currentTab === 'data' && (
          <div className="ribbon-group-row">
            {/* 排序与筛选 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn-icon"
                onClick={() => onSort('asc')}
              >
                <ArrowDownUp size={14} />
                升序 A→Z
              </button>
              <button
                className="ribbon-btn-icon"
                onClick={() => onSort('desc')}
              >
                <ArrowDownUp size={14} />
                降序 Z→A
              </button>
              <button
                className="ribbon-btn-icon"
                onClick={() => onOpenInsertDialog('dropdown')}
              >
                <Filter size={14} />
                自动筛选
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 数据填充与清洗 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn"
                disabled={!canFillDown}
                title="将选区首行填充到下方 (Ctrl+D)"
                onClick={() => onFill('down')}
              >
                向下填充
              </button>
              <button
                className="ribbon-btn"
                disabled={!canFillRight}
                title="将选区首列填充到右侧 (Ctrl+R)"
                onClick={() => onFill('right')}
              >
                向右填充
              </button>
              <button
                className="ribbon-btn"
                onClick={() => onOpenInsertDialog('dropdown')}
              >
                数据有效性
              </button>
              <button
                className="ribbon-btn"
                onClick={() => onOpenInsertDialog('dropdown')}
              >
                删除重复项
              </button>
              <button
                className="ribbon-btn"
                onClick={() => onOpenInsertDialog('dropdown')}
              >
                文本分列
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 尺寸设置 */}
            <div className="ribbon-group">
              <label className="ribbon-size-input">
                列宽
                <input
                  type="number"
                  min="48"
                  max="600"
                  value={columnWidth}
                  onChange={(e) => onColumnWidthChange(e.target.value)}
                />
              </label>
              <button className="ribbon-btn" onClick={onApplyColumnWidth}>
                应用
              </button>
              <label className="ribbon-size-input">
                行高
                <input
                  type="number"
                  min="24"
                  max="300"
                  value={rowHeight}
                  onChange={(e) => onRowHeightChange(e.target.value)}
                />
              </label>
              <button className="ribbon-btn" onClick={onApplyRowHeight}>
                应用
              </button>
            </div>
          </div>
        )}

        {currentTab === 'formula' && (
          <div className="ribbon-group-row">
            {/* 常用函数快捷库 */}
            <div className="ribbon-group">
              <select
                className="ribbon-select"
                aria-label="常用函数"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  ƒx 常用函数
                </option>
                <option value="SUM">SUM (求和)</option>
                <option value="AVERAGE">AVERAGE (平均值)</option>
                <option value="COUNT">COUNT (计数)</option>
                <option value="MAX">MAX (最大值)</option>
                <option value="MIN">MIN (最小值)</option>
                <option value="IF">IF (条件判断)</option>
              </select>

              <select
                className="ribbon-select"
                aria-label="逻辑函数"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  逻辑函数
                </option>
                <option value="IF">IF</option>
                <option value="AND">AND</option>
                <option value="OR">OR</option>
                <option value="NOT">NOT</option>
              </select>

              <select
                className="ribbon-select"
                aria-label="数学与三角"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  数学与三角
                </option>
                <option value="SUM">SUM</option>
                <option value="ROUND">ROUND</option>
                <option value="ABS">ABS</option>
                <option value="INT">INT</option>
                <option value="MOD">MOD</option>
              </select>

              <select
                className="ribbon-select"
                aria-label="统计与查找"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  统计与查找
                </option>
                <option value="AVERAGE">AVERAGE</option>
                <option value="COUNT">COUNT</option>
                <option value="MAX">MAX</option>
                <option value="MIN">MIN</option>
                <option value="VLOOKUP">VLOOKUP</option>
              </select>
            </div>

            <div className="ribbon-divider" />

            {/* 公式计算与提示 */}
            <div className="ribbon-group">
              <span className="ribbon-hint">支持单元格引用、四则运算与嵌套函数</span>
              <button
                className="ribbon-btn-icon"
                onClick={() => onInsertFormula('SUM')}
              >
                <Calculator size={14} />
                自动计算中
              </button>
            </div>
          </div>
        )}

        {currentTab === 'view' && (
          <div className="ribbon-group-row">
            {/* 护眼与阅读 */}
            <div className="ribbon-group">
              <button
                className={`ribbon-btn-icon ${viewSettings.eyeCare ? 'active' : ''}`}
                onClick={() =>
                  onViewSettingsChange({ eyeCare: !viewSettings.eyeCare })
                }
              >
                <Eye size={14} />
                护眼模式
              </button>
              <button
                className={`ribbon-btn-icon ${viewSettings.highlightRowCol ? 'active' : ''}`}
                onClick={() =>
                  onViewSettingsChange({
                    highlightRowCol: !viewSettings.highlightRowCol,
                  })
                }
              >
                <Layers size={14} />
                高亮行列
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 冻结窗格 */}
            <div className="ribbon-group">
              <select
                className="ribbon-select"
                aria-label="冻结窗格"
                value=""
                onChange={(e) => onFreeze(e.target.value)}
              >
                <option value="" disabled>
                  冻结窗格
                </option>
                <option value="first-row">冻结首行</option>
                <option value="first-column">冻结首列</option>
                <option value="selection" disabled={!canFreezeSelection}>
                  冻结至当前单元格
                </option>
                <option
                  value="none"
                  disabled={!frozenRows && !frozenColumns}
                >
                  取消冻结
                </option>
              </select>
              {!!(frozenRows || frozenColumns) && (
                <span className="frozen-badge">
                  已冻结 {frozenRows}行·{frozenColumns}列
                </span>
              )}
            </div>

            <div className="ribbon-divider" />

            {/* 显示元素开关 */}
            <div className="ribbon-group">
              <label className="ribbon-checkbox">
                <input
                  type="checkbox"
                  checked={viewSettings.showGridlines}
                  onChange={(e) =>
                    onViewSettingsChange({ showGridlines: e.target.checked })
                  }
                />
                网格线
              </label>
              <label className="ribbon-checkbox">
                <input
                  type="checkbox"
                  checked={viewSettings.showHeadings}
                  onChange={(e) =>
                    onViewSettingsChange({ showHeadings: e.target.checked })
                  }
                />
                行号列标
              </label>
              <label className="ribbon-checkbox">
                <input
                  type="checkbox"
                  checked={viewSettings.zebraStripe}
                  onChange={(e) =>
                    onViewSettingsChange({ zebraStripe: e.target.checked })
                  }
                />
                隔行标记
              </label>
            </div>

            <div className="ribbon-divider" />

            {/* 显示比例与全屏 */}
            <div className="ribbon-group">
              <select
                className="ribbon-select"
                aria-label="显示比例"
                value={String(viewSettings.zoom)}
                onChange={(e) =>
                  onViewSettingsChange({ zoom: Number(e.target.value) })
                }
              >
                <option value="75">75%</option>
                <option value="100">100%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
              </select>
              <button
                className="ribbon-btn-icon"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen?.().catch(() => {});
                  } else {
                    document.exitFullscreen?.().catch(() => {});
                  }
                }}
              >
                <Maximize2 size={14} />
                全屏显示
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
