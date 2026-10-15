import { useState } from 'react';
import SheetColorPickerDropdown from './SheetColorPickerDropdown';
import SheetBorderDropdown from './SheetBorderDropdown';
import SheetFontDropdown from './SheetFontDropdown';
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
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Sliders,
  Rows,
  Columns,
  QrCode,
} from 'lucide-react';
import type { SheetRibbonProps, RibbonTab } from './types';

export default function SheetRibbon({
  currentTab,
  onTabChange,
  currentStyle,
  onStyleChange,
  onApplyBorder,
  onClearContent,
  onClearFormat,
  usedColors = [],
  usedFills = [],
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
  onRecalculate,
  viewSettings,
  onViewSettingsChange,
  onAddRows,
  onAddCols,
  canAddRows,
  canAddCols,
  onOpenFindReplace,
  onOpenInsertDialog,
  onTextToNumber,
}: SheetRibbonProps) {
  const [formatBrushActive, setFormatBrushActive] = useState(false);
  const [selectedFont, setSelectedFont] = useState('微软雅黑');
  const [selectedFontSize, setSelectedFontSize] = useState(10);

  function handleFontStep(delta: number) {
    const SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
    const currIdx = SIZES.indexOf(selectedFontSize);
    const nextIdx = Math.max(0, Math.min(SIZES.length - 1, (currIdx >= 0 ? currIdx : 1) + delta));
    setSelectedFontSize(SIZES[nextIdx]);
  }

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

            {/* 字体与字号 */}
            <div className="ribbon-group">
              <SheetFontDropdown
                currentFont={selectedFont}
                onSelect={(font) => {
                  setSelectedFont(font);
                }}
                trigger={
                  <button className="ribbon-btn ribbon-dropdown-trigger">
                    <span>{selectedFont.split(',')[0].replace(/"/g, '')}</span>
                    <ChevronDown size={12} />
                  </button>
                }
              />

              <select
                className="ribbon-select ribbon-size-select"
                aria-label="字号"
                value={selectedFontSize}
                onChange={(e) => setSelectedFontSize(Number(e.target.value))}
              >
                {[9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <button
                className="ribbon-icon-btn"
                title="增大字号"
                onClick={() => handleFontStep(1)}
              >
                <span style={{ fontSize: 13, fontWeight: 700 }}>A⁺</span>
              </button>
              <button
                className="ribbon-icon-btn"
                title="缩小字号"
                onClick={() => handleFontStep(-1)}
              >
                <span style={{ fontSize: 11, fontWeight: 700 }}>A⁻</span>
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 样式与边框/颜色 */}
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

              {/* 边框下拉菜单 */}
              <SheetBorderDropdown
                currentBorder={currentStyle.border}
                onChange={(hasBorder) => onStyleChange({ border: hasBorder })}
                onApplyBorder={onApplyBorder}
                trigger={
                  <button
                    className={`ribbon-icon-btn ribbon-dropdown-trigger ${currentStyle.border ? 'active' : ''}`}
                    title="设置边框"
                  >
                    <Grid size={15} />
                    <ChevronDown size={10} />
                  </button>
                }
              />

              {/* 字体颜色下拉菜单 */}
              <SheetColorPickerDropdown
                type="color"
                currentColor={currentStyle.color}
                usedColors={usedColors}
                onChange={(color) => onStyleChange({ color: color ?? '#000000' })}
                trigger={
                  <button
                    className="ribbon-icon-btn ribbon-color-trigger"
                    title="文字颜色"
                  >
                    <span
                      className="color-indicator"
                      style={{ color: currentStyle.color ?? '#2b382f' }}
                    >
                      A
                    </span>
                    <ChevronDown size={10} />
                  </button>
                }
              />

              {/* 单元格填充背景下拉菜单 */}
              <SheetColorPickerDropdown
                type="fill"
                currentColor={currentStyle.fill}
                usedColors={usedFills}
                onChange={(fill) => onStyleChange({ fill })}
                trigger={
                  <button
                    className="ribbon-icon-btn ribbon-color-trigger"
                    title="单元格填充背景"
                  >
                    <span
                      className="fill-indicator"
                      style={{ backgroundColor: currentStyle.fill ?? 'transparent' }}
                    />
                    <ChevronDown size={10} />
                  </button>
                }
              />
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
            {/* 数据透视表 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn-icon"
                title="基于当前表格数据区域创建动态多维交叉透视报表"
                onClick={() => onOpenInsertDialog('pivot')}
              >
                <Table size={14} />
                透视表
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 行列操作下拉 */}
            <div className="ribbon-group">
              <select
                className="ribbon-select"
                aria-label="插入或删除行列"
                value=""
                onChange={(e) => {
                  const [axis, op] = e.target.value.split('-');
                  onStructure(axis as 'row' | 'col', op as 'insert' | 'delete');
                }}
              >
                <option value="" disabled>
                  行列 ˅
                </option>
                <option value="row-insert">在上方插入行</option>
                <option value="col-insert">在左侧插入列</option>
                <option value="row-delete">删除选中行</option>
                <option value="col-delete">删除选中列</option>
              </select>
            </div>

            <div className="ribbon-divider" />

            {/* 表单控件 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn-icon"
                title="插入可勾选方框 [ ]"
                onClick={() => onOpenInsertDialog('checkbox')}
              >
                <CheckSquare size={14} />
                复选框
              </button>
              <button
                className="ribbon-btn-icon"
                title="设置单元格下拉单选列表 (数据验证)"
                onClick={() => onOpenInsertDialog('dropdown')}
              >
                <ListFilter size={14} />
                下拉列表
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 多媒体与富文本 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn-icon"
                title="在单元格中插入图片"
                onClick={() => onOpenInsertDialog('image')}
              >
                <Image size={14} />
                图片
              </button>
              <button
                className="ribbon-btn-icon"
                title="插入超链接"
                onClick={() => onOpenInsertDialog('link')}
              >
                <Link size={14} />
                超链接
              </button>
              <button
                className="ribbon-btn-icon"
                title="插入说明文本框"
                onClick={() => onOpenInsertDialog('textbox')}
              >
                <FileText size={14} />
                文本框
              </button>
              <button
                className="ribbon-btn-icon"
                title="设置工作表水印（绝密、内部、草稿等）"
                onClick={() => onOpenInsertDialog('watermark')}
              >
                <Sparkles size={14} />
                水印
              </button>
              <button
                className="ribbon-btn-icon"
                title="输入网址或文本生成二维码"
                onClick={() => onOpenInsertDialog('qrcode')}
              >
                <QrCode size={14} />
                二维码
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 符号与批注 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn-icon"
                title="插入货币、数学等特殊符号"
                onClick={() => onOpenInsertDialog('symbol')}
              >
                <span style={{ fontSize: 13, fontWeight: 700 }}>Ω</span>
                符号
              </button>
              <button
                className="ribbon-btn-icon"
                title="为当前单元格添加批注"
                onClick={() => onOpenInsertDialog('comment')}
              >
                <MessageSquare size={14} />
                批注
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 统计图表 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn-icon"
                title="插入柱形图"
                onClick={() => onOpenInsertDialog('chart')}
              >
                <BarChart2 size={14} />
                柱形图
              </button>
              <button
                className="ribbon-btn-icon"
                title="插入折线图"
                onClick={() => onOpenInsertDialog('chart')}
              >
                <LineChart size={14} />
                折线图
              </button>
              <button
                className="ribbon-btn-icon"
                title="插入饼图"
                onClick={() => onOpenInsertDialog('chart')}
              >
                <PieChart size={14} />
                饼图
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 扩充容量 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn"
                disabled={!canAddRows}
                title="在工作表底部扩充 50 行"
                onClick={onAddRows}
              >
                <Plus size={13} /> 50 行
              </button>
              <button
                className="ribbon-btn"
                disabled={!canAddCols}
                title="在工作表右侧扩充 5 列"
                onClick={onAddCols}
              >
                <Plus size={13} /> 5 列
              </button>
            </div>
          </div>
        )}

        {currentTab === 'data' && (
          <div className="ribbon-group-row">
            {/* 数据导入 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn-icon"
                title="导入 CSV / 纯文本数据并自动按行列填充"
                onClick={() => onOpenInsertDialog('import-csv')}
              >
                <FileSpreadsheet size={14} />
                导入数据
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 排序与筛选 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn-icon"
                title="按当前选区升序排列 (A→Z)"
                onClick={() => onSort('asc')}
              >
                <ArrowDownUp size={14} />
                升序 ↑
              </button>
              <button
                className="ribbon-btn-icon"
                title="按当前选区降序排列 (Z→A)"
                onClick={() => onSort('desc')}
              >
                <ArrowDownUp size={14} />
                降序 ↓
              </button>
              <button
                className="ribbon-btn-icon"
                title="开启自动筛选"
                onClick={() => onOpenInsertDialog('dropdown')}
              >
                <Filter size={14} />
                筛选
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 数据处理与清洗 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn"
                title="将文本型数字转换为标准数值（去除左上角绿色角标）"
                onClick={onTextToNumber}
              >
                文本转数值
              </button>
              <button
                className="ribbon-btn"
                title="设置数据有效性 / 输入验证"
                onClick={() => onOpenInsertDialog('dropdown')}
              >
                数据有效性
              </button>
              <button
                className="ribbon-btn"
                title="查找或删除选区中的重复行"
                onClick={() => onOpenInsertDialog('dropdown')}
              >
                重复项 ˅
              </button>
              <button
                className="ribbon-btn"
                title="将文本按特定分隔符分列到多个单元格"
                onClick={() => onOpenInsertDialog('dropdown')}
              >
                分列
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 批量填充 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn"
                disabled={!canFillDown}
                title="向下填充选区首行 (Ctrl+D)"
                onClick={() => onFill('down')}
              >
                向下填充
              </button>
              <button
                className="ribbon-btn"
                disabled={!canFillRight}
                title="向右填充选区首列 (Ctrl+R)"
                onClick={() => onFill('right')}
              >
                向右填充
              </button>
            </div>

            <div className="ribbon-divider" />

            {/* 行列尺寸 */}
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

            <div className="ribbon-divider" />

            {/* 扩充容量 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn"
                disabled={!canAddRows}
                onClick={onAddRows}
              >
                +50 行
              </button>
              <button
                className="ribbon-btn"
                disabled={!canAddCols}
                onClick={onAddCols}
              >
                +5 列
              </button>
            </div>
          </div>
        )}

        {currentTab === 'formula' && (
          <div className="ribbon-group-row">
            {/* 常用函数 */}
            <div className="ribbon-group">
              <select
                className="ribbon-select"
                aria-label="常用函数"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  ƒx 常用函数 ˅
                </option>
                <option value="SUM">SUM (求和)</option>
                <option value="AVERAGE">AVERAGE (平均值)</option>
                <option value="COUNT">COUNT (计数)</option>
                <option value="MAX">MAX (最大值)</option>
                <option value="MIN">MIN (最小值)</option>
                <option value="IF">IF (条件判断)</option>
                <option value="VLOOKUP">VLOOKUP (匹配查找)</option>
              </select>

              <select
                className="ribbon-select"
                aria-label="财务函数"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  财务 ˅
                </option>
                <option value="PMT">PMT (每期付款额)</option>
                <option value="FV">FV (终值)</option>
                <option value="PV">PV (现值)</option>
                <option value="NPV">NPV (净现值)</option>
                <option value="IRR">IRR (内部收益率)</option>
              </select>

              <select
                className="ribbon-select"
                aria-label="逻辑函数"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  逻辑 ˅
                </option>
                <option value="IF">IF</option>
                <option value="AND">AND</option>
                <option value="OR">OR</option>
                <option value="NOT">NOT</option>
                <option value="IFERROR">IFERROR</option>
              </select>

              <select
                className="ribbon-select"
                aria-label="文本函数"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  文本 ˅
                </option>
                <option value="CONCATENATE">CONCATENATE (拼接)</option>
                <option value="LEFT">LEFT (左取字符)</option>
                <option value="RIGHT">RIGHT (右取字符)</option>
                <option value="MID">MID (截取中间)</option>
                <option value="TRIM">TRIM (去除空格)</option>
                <option value="UPPER">UPPER (转大写)</option>
                <option value="LOWER">LOWER (转小写)</option>
                <option value="LEN">LEN (字符长度)</option>
              </select>

              <select
                className="ribbon-select"
                aria-label="日期与时间"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  日期与时间 ˅
                </option>
                <option value="TODAY">TODAY (今天日期)</option>
                <option value="NOW">NOW (当前时间)</option>
                <option value="YEAR">YEAR (提取年份)</option>
                <option value="MONTH">MONTH (提取月份)</option>
                <option value="DAY">DAY (提取天数)</option>
                <option value="DATE">DATE (构建日期)</option>
              </select>

              <select
                className="ribbon-select"
                aria-label="查找与引用"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  查找与引用 ˅
                </option>
                <option value="VLOOKUP">VLOOKUP (垂直匹配)</option>
                <option value="INDEX">INDEX (按行列取值)</option>
                <option value="MATCH">MATCH (返回相对位置)</option>
              </select>

              <select
                className="ribbon-select"
                aria-label="数学与三角"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  数学与三角 ˅
                </option>
                <option value="SUM">SUM (求和)</option>
                <option value="ROUND">ROUND (四舍五入)</option>
                <option value="ROUNDUP">ROUNDUP (向上舍入)</option>
                <option value="ROUNDDOWN">ROUNDDOWN (向下舍入)</option>
                <option value="ABS">ABS (绝对值)</option>
                <option value="INT">INT (向下取整)</option>
                <option value="MOD">MOD (取余数)</option>
                <option value="POWER">POWER (乘幂)</option>
              </select>

              <select
                className="ribbon-select"
                aria-label="统计与信息"
                value=""
                onChange={(e) => onInsertFormula(e.target.value)}
              >
                <option value="" disabled>
                  统计与信息 ˅
                </option>
                <option value="AVERAGE">AVERAGE (平均值)</option>
                <option value="COUNT">COUNT (数值计数)</option>
                <option value="COUNTA">COUNTA (非空计数)</option>
                <option value="COUNTIF">COUNTIF (条件计数)</option>
                <option value="MAX">MAX (最大值)</option>
                <option value="MIN">MIN (最小值)</option>
                <option value="MEDIAN">MEDIAN (中位数)</option>
                <option value="ISNUMBER">ISNUMBER (是否数字)</option>
                <option value="ISTEXT">ISTEXT (是否文本)</option>
              </select>
            </div>

            <div className="ribbon-divider" />

            {/* 重新计算与控制 */}
            <div className="ribbon-group">
              <button
                className="ribbon-btn-icon"
                title="重新计算当前工作表所有公式并刷新数据"
                onClick={onRecalculate}
              >
                <RotateCcw size={14} />
                重新计算
              </button>
              <span className="ribbon-hint">自动计算已启用</span>
            </div>
          </div>
        )}

        {currentTab === 'view' && (
          <div className="ribbon-group-row">
            {/* 视觉护眼与阅读 */}
            <div className="ribbon-group">
              <button
                className={`ribbon-btn-icon ${viewSettings.eyeCare ? 'active' : ''}`}
                title="开启柔和豆沙绿护眼配色，缓解长时间盯屏视觉疲劳"
                onClick={() =>
                  onViewSettingsChange({ eyeCare: !viewSettings.eyeCare })
                }
              >
                <Eye size={14} />
                护眼模式
              </button>
              <button
                className={`ribbon-btn-icon ${viewSettings.highlightRowCol ? 'active' : ''}`}
                title="十字聚光灯模式：高亮当前选中单元格所在的整行与整列"
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
                  冻结窗格 ˅
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

            {/* 视图元素显示开关 */}
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
              <label className="ribbon-checkbox">
                <input
                  type="checkbox"
                  checked={viewSettings.hideZeros ?? false}
                  onChange={(e) =>
                    onViewSettingsChange({ hideZeros: e.target.checked })
                  }
                />
                隐藏零值
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
                <option value="50">50%</option>
                <option value="75">75%</option>
                <option value="90">90%</option>
                <option value="100">100%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
                <option value="200">200%</option>
              </select>
              <button
                className="ribbon-btn-icon"
                title="切换沉浸式全屏编辑"
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
