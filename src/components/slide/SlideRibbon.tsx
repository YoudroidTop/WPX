import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Copy,
  ArrowUp,
  ArrowDown,
  Trash2,
  Undo2,
  Redo2,
  Paintbrush,
  Type,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Square,
  Circle,
  Triangle,
  ArrowRight,
  Star,
  MessageSquare,
  Minus,
  Table as TableIcon,
  BarChart2,
  Image as ImageIcon,
  Sparkles,
  Play,
  Tv,
  Eye,
  Grid,
  Maximize2,
  Palette,
  Layers,
  ChevronDown,
  Milestone,
  Columns2,
  Columns3,
  Heading1,
  Quote,
  RotateCcw,
  Sliders,
  Check,
  CheckSquare,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';
import type {
  SlideRibbonTab,
  SlideLayout,
  SlideTheme,
  SlideTransition,
  ShapeKind,
  SlideViewSettings,
} from './types';
import { THEME_PRESETS, TRANSITION_PRESETS, LAYOUT_PRESETS } from './types';
import { LayoutPickerDropdown } from './SlideModals';

export const FONT_FAMILIES = [
  { label: '系统默认', value: '' },
  { label: '微软雅黑', value: 'Microsoft YaHei, sans-serif' },
  { label: '苹方 / PingFang SC', value: 'PingFang SC, sans-serif' },
  { label: '宋体 / SimSun', value: 'SimSun, serif' },
  { label: '黑体 / SimHei', value: 'SimHei, sans-serif' },
  { label: '楷体 / KaiTi', value: 'KaiTi, serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
];

export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72];

interface SlideRibbonProps {
  currentTab: SlideRibbonTab;
  onTabChange: (tab: SlideRibbonTab) => void;
  // Slide manipulation
  onAddSlide: (layout?: SlideLayout) => void;
  onDuplicateSlide: () => void;
  onMoveSlide: (delta: number) => void;
  onDeleteSlide: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
  canAdd: boolean;
  // History
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // Format painter
  formatPainterActive: boolean;
  onToggleFormatPainter: () => void;
  // Formatting
  activeFontFamily: string;
  onFontFamilyChange: (font: string) => void;
  activeFontSize: number;
  onFontSizeChange: (size: number) => void;
  onStepFontSize: (delta: number) => void;
  activeBold: boolean;
  onToggleBold: () => void;
  activeItalic: boolean;
  onToggleItalic: () => void;
  activeUnderline: boolean;
  onToggleUnderline: () => void;
  activeStrike: boolean;
  onToggleStrike: () => void;
  activeColor: string;
  onColorChange: (color: string) => void;
  activeAlign: 'left' | 'center' | 'right' | 'justify';
  onAlignChange: (align: 'left' | 'center' | 'right' | 'justify') => void;
  onLineSpacing: (spacing: number) => void;
  // Layer arrangement
  onArrange: (action: 'front' | 'back' | 'forward' | 'backward') => void;
  // Insert triggers
  onInsertTextBox: (mode?: 'horizontal' | 'vertical' | 'metric') => void;
  onInsertShape: (kind: ShapeKind) => void;
  onOpenImageModal: () => void;
  onOpenTableModal: () => void;
  onOpenChartModal: () => void;
  onOpenIconModal: () => void;
  onInsertCardModule: (type: 'timeline' | 'cards' | 'quote') => void;
  // Design & theme
  ratio: '16:9' | '4:3';
  onRatioChange: (ratio: '16:9' | '4:3') => void;
  currentTheme: SlideTheme;
  onThemeChange: (theme: SlideTheme) => void;
  currentLayout?: SlideLayout;
  onLayoutChange: (layout: SlideLayout) => void;
  onApplyThemeToAll: () => void;
  onCustomBackground: (color: string, gradientEnd?: string) => void;
  // Transition
  currentTransition: SlideTransition;
  onTransitionChange: (transition: SlideTransition) => void;
  onApplyTransitionToAll: () => void;
  // View settings
  viewSettings: SlideViewSettings;
  onViewSettingsChange: (settings: Partial<SlideViewSettings>) => void;
  // Presentation
  onStartPresentation: (fromBeginning: boolean, presenterMode?: boolean) => void;
}

export default function SlideRibbon(props: SlideRibbonProps) {
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [layoutDropdownOpen, setLayoutDropdownOpen] = useState(false);
  const [shapeDropdownOpen, setShapeDropdownOpen] = useState(false);
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const [ratioDropdownOpen, setRatioDropdownOpen] = useState(false);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [bgColor, setBgColor] = useState('#eaf1e9');
  const [bgGradEnd, setBgGradEnd] = useState('#d5e5d3');
  const [isGradient, setIsGradient] = useState(false);

  useEffect(() => {
    const el = document.getElementById('editor-header-tabs');
    setHeaderTarget(el);
  }, []);

  // Top header tab navigation portal
  const topHeaderTabs = (
    <div className="header-ribbon-tabs">
      <button
        type="button"
        className={`header-tab-btn ${props.currentTab === 'home' ? 'active' : ''}`}
        onClick={() => props.onTabChange('home')}
      >
        开始
      </button>
      <button
        type="button"
        className={`header-tab-btn ${props.currentTab === 'insert' ? 'active' : ''}`}
        onClick={() => props.onTabChange('insert')}
      >
        插入
      </button>
      <button
        type="button"
        className={`header-tab-btn ${props.currentTab === 'design' ? 'active' : ''}`}
        onClick={() => props.onTabChange('design')}
      >
        设计
      </button>
      <button
        type="button"
        className={`header-tab-btn ${props.currentTab === 'transition' ? 'active' : ''}`}
        onClick={() => props.onTabChange('transition')}
      >
        切换
      </button>
      <button
        type="button"
        className={`header-tab-btn ${props.currentTab === 'view' ? 'active' : ''}`}
        onClick={() => props.onTabChange('view')}
      >
        视图
      </button>
      <button
        type="button"
        className={`header-tab-btn ${props.currentTab === 'slideshow' ? 'active' : ''}`}
        onClick={() => props.onTabChange('slideshow')}
      >
        放映
      </button>
    </div>
  );

  return (
    <div className="slide-ribbon-container">
      {headerTarget && createPortal(topHeaderTabs, headerTarget)}

      {/* Main Ribbon Content */}
      <div className="ribbon-bar">
        {/* --- HOME TAB --- */}
        {props.currentTab === 'home' && (
          <div className="ribbon-tab-pane">
            {/* Slide Structure Group */}
            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
                  <button
                    type="button"
                    className="ribbon-btn ribbon-btn-large"
                    disabled={!props.canAdd}
                    onClick={() => props.onAddSlide()}
                    title="新建幻灯片"
                    aria-label="新建幻灯片"
                  >
                    <Plus size={20} />
                    <span>新建幻灯片</span>
                  </button>
                  <button
                    type="button"
                    className="ribbon-btn"
                    style={{ padding: '0 4px', borderLeft: '1px solid #e0e6dc' }}
                    onClick={() => setLayoutDropdownOpen((v) => !v)}
                    title="选择新建幻灯片版式"
                    aria-label="选择幻灯片版式"
                  >
                    <ChevronDown size={12} />
                  </button>
                  {layoutDropdownOpen && (
                    <LayoutPickerDropdown
                      currentLayout={props.currentLayout}
                      onSelect={(l) => {
                        props.onAddSlide(l);
                        setLayoutDropdownOpen(false);
                      }}
                      onClose={() => setLayoutDropdownOpen(false)}
                    />
                  )}
                </div>

                <div className="ribbon-btn-column">
                  <button
                    type="button"
                    className="ribbon-btn"
                    disabled={!props.canAdd}
                    onClick={props.onDuplicateSlide}
                    title="复制当前页"
                  >
                    <Copy size={14} />
                    <span>复制</span>
                  </button>
                  <button
                    type="button"
                    className="ribbon-btn"
                    disabled={!props.canDelete}
                    onClick={props.onDeleteSlide}
                    title="删除当前页"
                  >
                    <Trash2 size={14} />
                    <span>删除</span>
                  </button>
                </div>

                <div className="ribbon-btn-column">
                  <button
                    type="button"
                    className="ribbon-btn"
                    disabled={!props.canMoveUp}
                    onClick={() => props.onMoveSlide(-1)}
                    title="上移幻灯片"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="ribbon-btn"
                    disabled={!props.canMoveDown}
                    onClick={() => props.onMoveSlide(1)}
                    title="下移幻灯片"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
              </div>
              <span className="ribbon-group-title">幻灯片</span>
            </div>

            {/* History & Clipboard Group */}
            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <div className="ribbon-btn-column">
                  <button
                    type="button"
                    className="ribbon-btn"
                    disabled={!props.canUndo}
                    onClick={props.onUndo}
                    title="撤销 (Ctrl+Z)"
                  >
                    <Undo2 size={14} />
                    <span>撤销</span>
                  </button>
                  <button
                    type="button"
                    className="ribbon-btn"
                    disabled={!props.canRedo}
                    onClick={props.onRedo}
                    title="重做 (Ctrl+Y)"
                  >
                    <Redo2 size={14} />
                    <span>重做</span>
                  </button>
                </div>
                <button
                  type="button"
                  className={`ribbon-btn ${props.formatPainterActive ? 'active' : ''}`}
                  onClick={props.onToggleFormatPainter}
                  title="格式刷：复制并应用选中文本或形状样式"
                >
                  <Paintbrush size={16} />
                  <span>格式刷</span>
                </button>
              </div>
              <span className="ribbon-group-title">剪贴板与历史</span>
            </div>

            {/* Typography Group */}
            <div className="ribbon-group">
              <div className="ribbon-group-content" style={{ flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <select
                    className="ribbon-select font-select"
                    value={props.activeFontFamily}
                    onChange={(e) => props.onFontFamilyChange(e.target.value)}
                    title="字体选择"
                  >
                    {FONT_FAMILIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>

                  <select
                    className="ribbon-select size-select"
                    value={props.activeFontSize}
                    onChange={(e) => props.onFontSizeChange(Number(e.target.value))}
                    title="字号大小"
                  >
                    {FONT_SIZES.map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="ribbon-btn"
                    onClick={() => props.onStepFontSize(2)}
                    title="增大字号"
                  >
                    A<sup>+</sup>
                  </button>
                  <button
                    type="button"
                    className="ribbon-btn"
                    onClick={() => props.onStepFontSize(-2)}
                    title="减小字号"
                  >
                    A<sup>-</sup>
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button
                    type="button"
                    className={`ribbon-btn ${props.activeBold ? 'active' : ''}`}
                    onClick={props.onToggleBold}
                    title="加粗 (Ctrl+B)"
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    type="button"
                    className={`ribbon-btn ${props.activeItalic ? 'active' : ''}`}
                    onClick={props.onToggleItalic}
                    title="倾斜 (Ctrl+I)"
                  >
                    <Italic size={14} />
                  </button>
                  <button
                    type="button"
                    className={`ribbon-btn ${props.activeUnderline ? 'active' : ''}`}
                    onClick={props.onToggleUnderline}
                    title="下划线 (Ctrl+U)"
                  >
                    <Underline size={14} />
                  </button>
                  <button
                    type="button"
                    className={`ribbon-btn ${props.activeStrike ? 'active' : ''}`}
                    onClick={props.onToggleStrike}
                    title="删除线"
                  >
                    <Strikethrough size={14} />
                  </button>

                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <button
                      type="button"
                      className="ribbon-btn"
                      onClick={() => setColorDropdownOpen((v) => !v)}
                      title="文本颜色"
                    >
                      <Palette size={14} style={{ color: props.activeColor || '#174c3b' }} />
                      <ChevronDown size={10} />
                    </button>
                    {colorDropdownOpen && (
                      <div
                        className="slide-dropdown-menu color-dropdown"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="color-palette-title">快捷文本色彩</div>
                        <div className="color-swatches-grid">
                          {[
                            '#000000',
                            '#333333',
                            '#666666',
                            '#999999',
                            '#174c3b',
                            '#2f855a',
                            '#1e3a8a',
                            '#3b82f6',
                            '#881337',
                            '#e11d48',
                            '#78350f',
                            '#d97706',
                            '#4c1d95',
                            '#7c3aed',
                            '#ffffff',
                          ].map((c) => (
                            <button
                              key={c}
                              className="color-swatch-cell"
                              style={{ backgroundColor: c }}
                              onClick={() => {
                                props.onColorChange(c);
                                setColorDropdownOpen(false);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <span className="ribbon-group-title">字体与样式</span>
            </div>

            {/* Paragraph & Alignment Group */}
            <div className="ribbon-group">
              <div className="ribbon-group-content" style={{ flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button
                    type="button"
                    className={`ribbon-btn ${props.activeAlign === 'left' ? 'active' : ''}`}
                    onClick={() => props.onAlignChange('left')}
                    title="左对齐"
                  >
                    <AlignLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className={`ribbon-btn ${props.activeAlign === 'center' ? 'active' : ''}`}
                    onClick={() => props.onAlignChange('center')}
                    title="居中对齐"
                  >
                    <AlignCenter size={14} />
                  </button>
                  <button
                    type="button"
                    className={`ribbon-btn ${props.activeAlign === 'right' ? 'active' : ''}`}
                    onClick={() => props.onAlignChange('right')}
                    title="右对齐"
                  >
                    <AlignRight size={14} />
                  </button>
                  <button
                    type="button"
                    className={`ribbon-btn ${props.activeAlign === 'justify' ? 'active' : ''}`}
                    onClick={() => props.onAlignChange('justify')}
                    title="两端对齐"
                  >
                    <AlignJustify size={14} />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    className="ribbon-btn"
                    onClick={() => props.onLineSpacing(1.2)}
                    title="行距 1.2 倍"
                  >
                    1.2
                  </button>
                  <button
                    type="button"
                    className="ribbon-btn"
                    onClick={() => props.onLineSpacing(1.5)}
                    title="行距 1.5 倍"
                  >
                    1.5
                  </button>
                  <button
                    type="button"
                    className="ribbon-btn"
                    onClick={() => props.onLineSpacing(2.0)}
                    title="行距 2.0 倍"
                  >
                    2.0
                  </button>
                </div>
              </div>
              <span className="ribbon-group-title">段落排版</span>
            </div>

            {/* Layer & Order Group */}
            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <div className="ribbon-btn-column">
                  <button
                    type="button"
                    className="ribbon-btn"
                    onClick={() => props.onArrange('front')}
                    title="置于顶层"
                  >
                    <span>置于顶层</span>
                  </button>
                  <button
                    type="button"
                    className="ribbon-btn"
                    onClick={() => props.onArrange('forward')}
                    title="上移一层"
                  >
                    <span>上移一层</span>
                  </button>
                </div>
                <div className="ribbon-btn-column">
                  <button
                    type="button"
                    className="ribbon-btn"
                    onClick={() => props.onArrange('back')}
                    title="置于底层"
                  >
                    <span>置于底层</span>
                  </button>
                  <button
                    type="button"
                    className="ribbon-btn"
                    onClick={() => props.onArrange('backward')}
                    title="下移一层"
                  >
                    <span>下移一层</span>
                  </button>
                </div>
              </div>
              <span className="ribbon-group-title">排列与图层</span>
            </div>
          </div>
        )}

        {/* --- INSERT TAB --- */}
        {props.currentTab === 'insert' && (
          <div className="ribbon-tab-pane">
            {/* Text Elements */}
            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={() => props.onInsertTextBox('horizontal')}
                  title="插入横向文本框"
                >
                  <Type size={20} />
                  <span>横向文本框</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={() => props.onInsertTextBox('metric')}
                  title="插入醒目指标大字号卡片"
                >
                  <TrendingUp size={20} />
                  <span>核心指标卡</span>
                </button>
              </div>
              <span className="ribbon-group-title">文本</span>
            </div>

            {/* Shapes */}
            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="ribbon-btn ribbon-btn-large"
                    onClick={() => setShapeDropdownOpen((v) => !v)}
                    title="插入几何形状"
                  >
                    <Square size={20} />
                    <span>形状库</span>
                    <ChevronDown size={12} />
                  </button>

                  {shapeDropdownOpen && (
                    <div
                      className="slide-dropdown-menu shape-dropdown"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="slide-dropdown-header">基础形状与箭头</div>
                      <div className="shape-picker-grid">
                        <button
                          className="shape-btn"
                          onClick={() => {
                            props.onInsertShape('rect');
                            setShapeDropdownOpen(false);
                          }}
                          title="矩形"
                        >
                          <Square size={18} />
                          <span>矩形</span>
                        </button>
                        <button
                          className="shape-btn"
                          onClick={() => {
                            props.onInsertShape('roundRect');
                            setShapeDropdownOpen(false);
                          }}
                          title="圆角矩形"
                        >
                          <Square size={18} style={{ borderRadius: 4 }} />
                          <span>圆角矩形</span>
                        </button>
                        <button
                          className="shape-btn"
                          onClick={() => {
                            props.onInsertShape('circle');
                            setShapeDropdownOpen(false);
                          }}
                          title="正圆 / 椭圆"
                        >
                          <Circle size={18} />
                          <span>圆形</span>
                        </button>
                        <button
                          className="shape-btn"
                          onClick={() => {
                            props.onInsertShape('triangle');
                            setShapeDropdownOpen(false);
                          }}
                          title="三角形"
                        >
                          <Triangle size={18} />
                          <span>三角形</span>
                        </button>
                        <button
                          className="shape-btn"
                          onClick={() => {
                            props.onInsertShape('arrowRight');
                            setShapeDropdownOpen(false);
                          }}
                          title="向右箭头"
                        >
                          <ArrowRight size={18} />
                          <span>向右箭头</span>
                        </button>
                        <button
                          className="shape-btn"
                          onClick={() => {
                            props.onInsertShape('star');
                            setShapeDropdownOpen(false);
                          }}
                          title="五角星"
                        >
                          <Star size={18} />
                          <span>五角星</span>
                        </button>
                        <button
                          className="shape-btn"
                          onClick={() => {
                            props.onInsertShape('callout');
                            setShapeDropdownOpen(false);
                          }}
                          title="对话气泡"
                        >
                          <MessageSquare size={18} />
                          <span>对话气泡</span>
                        </button>
                        <button
                          className="shape-btn"
                          onClick={() => {
                            props.onInsertShape('line');
                            setShapeDropdownOpen(false);
                          }}
                          title="分割线"
                        >
                          <Minus size={18} />
                          <span>分割线</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <span className="ribbon-group-title">图形与插画</span>
            </div>

            {/* Media & Data */}
            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={props.onOpenImageModal}
                  title="插入图片（支持本地、网络与推荐图库）"
                >
                  <ImageIcon size={20} />
                  <span>图片</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={props.onOpenTableModal}
                  title="插入表格"
                >
                  <TableIcon size={20} />
                  <span>表格</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={props.onOpenChartModal}
                  title="插入柱状/折线/饼图"
                >
                  <BarChart2 size={20} />
                  <span>图表</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={props.onOpenIconModal}
                  title="插入精美矢量图标"
                >
                  <Sparkles size={20} />
                  <span>图标库</span>
                </button>
              </div>
              <span className="ribbon-group-title">图表与多媒体</span>
            </div>

            {/* Smart Modules */}
            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={() => props.onInsertCardModule('timeline')}
                  title="插入 4 节点流程时间线"
                >
                  <Milestone size={20} />
                  <span>流程时间线</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={() => props.onInsertCardModule('cards')}
                  title="插入三列特性卡片"
                >
                  <Columns3 size={20} />
                  <span>三列卡片</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={() => props.onInsertCardModule('quote')}
                  title="插入核心金句卡片"
                >
                  <Quote size={20} />
                  <span>金句引用</span>
                </button>
              </div>
              <span className="ribbon-group-title">结构化卡片</span>
            </div>
          </div>
        )}

        {/* --- DESIGN TAB --- */}
        {props.currentTab === 'design' && (
          <div className="ribbon-tab-pane">
            {/* Aspect Ratio */}
            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="ribbon-btn ribbon-btn-large"
                    onClick={() => setRatioDropdownOpen((v) => !v)}
                    title="选择幻灯片屏幕比例"
                  >
                    <Sliders size={20} />
                    <span>{props.ratio === '16:9' ? '宽屏 16:9' : '标屏 4:3'}</span>
                    <ChevronDown size={12} />
                  </button>
                  {ratioDropdownOpen && (
                    <div
                      className="slide-dropdown-menu"
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: 140 }}
                    >
                      <button
                        className={`dropdown-item ${props.ratio === '16:9' ? 'active' : ''}`}
                        onClick={() => {
                          props.onRatioChange('16:9');
                          setRatioDropdownOpen(false);
                        }}
                      >
                        宽屏 16:9（推荐）
                      </button>
                      <button
                        className={`dropdown-item ${props.ratio === '4:3' ? 'active' : ''}`}
                        onClick={() => {
                          props.onRatioChange('4:3');
                          setRatioDropdownOpen(false);
                        }}
                      >
                        标屏 4:3（经典）
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <span className="ribbon-group-title">幻灯片画幅</span>
            </div>

            {/* Themes Presets */}
            <div className="ribbon-group">
              <div className="ribbon-group-content" style={{ gap: 8, alignItems: 'center' }}>
                <div className="theme-preset-strip">
                  {THEME_PRESETS.map((t) => (
                    <button
                      key={t.id}
                      className={`theme-badge-btn ${props.currentTheme === t.id ? 'active' : ''}`}
                      style={{ background: t.previewGradient || t.bg, color: t.text }}
                      onClick={() => props.onThemeChange(t.id)}
                      title={`应用 ${t.name} 配色`}
                    >
                      <span className="theme-text">Aa</span>
                      <small>{t.name}</small>
                    </button>
                  ))}
                </div>
              </div>
              <span className="ribbon-group-title">主题配色方案</span>
            </div>

            {/* Custom Background & Global Sync */}
            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="ribbon-btn ribbon-btn-large"
                    onClick={() => setBgPickerOpen((v) => !v)}
                    title="自定义当前页背景色或渐变"
                  >
                    <Palette size={20} />
                    <span>设置背景</span>
                  </button>
                  {bgPickerOpen && (
                    <div
                      className="slide-dropdown-menu"
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: 220, padding: 12 }}
                    >
                      <label
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                      >
                        <input
                          type="checkbox"
                          checked={isGradient}
                          onChange={(e) => setIsGradient(e.target.checked)}
                        />
                        启用双色渐变背景
                      </label>
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 12 }}>颜色 1:</span>
                        <input
                          type="color"
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                        />
                        {isGradient && (
                          <>
                            <span style={{ fontSize: 12 }}>颜色 2:</span>
                            <input
                              type="color"
                              value={bgGradEnd}
                              onChange={(e) => setBgGradEnd(e.target.value)}
                            />
                          </>
                        )}
                      </div>
                      <div
                        style={{
                          marginTop: 12,
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: 8,
                        }}
                      >
                        <button
                          className="secondary"
                          style={{ padding: '2px 8px', fontSize: 12 }}
                          onClick={() => setBgPickerOpen(false)}
                        >
                          取消
                        </button>
                        <button
                          className="primary"
                          style={{ padding: '2px 8px', fontSize: 12 }}
                          onClick={() => {
                            props.onCustomBackground(bgColor, isGradient ? bgGradEnd : undefined);
                            setBgPickerOpen(false);
                          }}
                        >
                          应用背景
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={props.onApplyThemeToAll}
                  title="将当前主题与背景一键应用至全套演示文稿"
                >
                  <RotateCcw size={20} />
                  <span>应用到全部</span>
                </button>
              </div>
              <span className="ribbon-group-title">背景与全局</span>
            </div>
          </div>
        )}

        {/* --- TRANSITION TAB --- */}
        {props.currentTab === 'transition' && (
          <div className="ribbon-tab-pane">
            <div className="ribbon-group">
              <div className="ribbon-group-content" style={{ gap: 8 }}>
                {TRANSITION_PRESETS.map((tr) => (
                  <button
                    key={tr.id}
                    className={`transition-card-btn ${props.currentTransition === tr.id ? 'active' : ''}`}
                    onClick={() => props.onTransitionChange(tr.id)}
                  >
                    <Tv size={18} />
                    <span>{tr.name}</span>
                  </button>
                ))}
              </div>
              <span className="ribbon-group-title">页面转场效果</span>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={props.onApplyTransitionToAll}
                  title="将选中的转场效果同步到所有幻灯片"
                >
                  <CheckSquare size={20} />
                  <span>应用到全部</span>
                </button>
              </div>
              <span className="ribbon-group-title">范围设置</span>
            </div>
          </div>
        )}

        {/* --- VIEW TAB --- */}
        {props.currentTab === 'view' && (
          <div className="ribbon-tab-pane">
            {/* View Mode */}
            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <button
                  type="button"
                  className={`ribbon-btn ribbon-btn-large ${!props.viewSettings.slideSorterOpen ? 'active' : ''}`}
                  onClick={() => props.onViewSettingsChange({ slideSorterOpen: false })}
                  title="切换到常规幻灯片编辑视图"
                >
                  <Eye size={20} />
                  <span>普通视图</span>
                </button>
                <button
                  type="button"
                  className={`ribbon-btn ribbon-btn-large ${props.viewSettings.slideSorterOpen ? 'active' : ''}`}
                  onClick={() => props.onViewSettingsChange({ slideSorterOpen: true })}
                  title="切换至大网格幻灯片浏览视图（方便快速重排与全貌掌握）"
                >
                  <Grid size={20} />
                  <span>幻灯片浏览</span>
                </button>
              </div>
              <span className="ribbon-group-title">视图模式</span>
            </div>

            {/* Display Elements */}
            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <button
                  type="button"
                  className={`ribbon-btn ${props.viewSettings.showNotes ? 'active' : ''}`}
                  onClick={() =>
                    props.onViewSettingsChange({ showNotes: !props.viewSettings.showNotes })
                  }
                  title="显示或隐藏演讲者备注框"
                >
                  <span>备注栏</span>
                </button>
                <button
                  type="button"
                  className={`ribbon-btn ${props.viewSettings.showGrid ? 'active' : ''}`}
                  onClick={() =>
                    props.onViewSettingsChange({ showGrid: !props.viewSettings.showGrid })
                  }
                  title="显示或隐藏对齐参考网格"
                >
                  <span>网格线</span>
                </button>
              </div>
              <span className="ribbon-group-title">辅助显示</span>
            </div>

            {/* Zoom Controls */}
            <div className="ribbon-group">
              <div className="ribbon-group-content" style={{ alignItems: 'center', gap: 6 }}>
                {[
                  { label: '自适应', val: 0 },
                  { label: '50%', val: 0.5 },
                  { label: '75%', val: 0.75 },
                  { label: '100%', val: 1.0 },
                  { label: '125%', val: 1.25 },
                ].map((z) => (
                  <button
                    key={z.val}
                    className={`ribbon-btn ${props.viewSettings.zoom === z.val ? 'active' : ''}`}
                    onClick={() => props.onViewSettingsChange({ zoom: z.val })}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
              <span className="ribbon-group-title">画布缩放</span>
            </div>
          </div>
        )}

        {/* --- SLIDESHOW TAB --- */}
        {props.currentTab === 'slideshow' && (
          <div className="ribbon-tab-pane">
            <div className="ribbon-group">
              <div className="ribbon-group-content">
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large play-button"
                  onClick={() => props.onStartPresentation(true)}
                  title="从第 1 页开始放映 (快捷键 F5)"
                >
                  <Play size={20} />
                  <span>从头开始</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={() => props.onStartPresentation(false)}
                  title="从当前幻灯片开始放映 (快捷键 Shift+F5)"
                >
                  <Play size={20} />
                  <span>从当前页开始</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-large"
                  onClick={() => props.onStartPresentation(false, true)}
                  title="开启演讲者视图模式（计时器、下一页预览与演讲备注）"
                >
                  <Tv size={20} />
                  <span>演讲者视图</span>
                </button>
              </div>
              <span className="ribbon-group-title">开始演示</span>
            </div>

            <div className="ribbon-group">
              <div
                className="ribbon-group-content"
                style={{ fontSize: 12, color: '#556b5d', lineHeight: 1.6 }}
              >
                <div>
                  <strong>放映快捷键：</strong>
                </div>
                <div>• [空格 / 右方向键 / 下方向键]：下一页</div>
                <div>• [左方向键 / 上方向键]：上一页</div>
                <div>• [B 键]：黑屏 / [W 键]：白屏</div>
                <div>• [P 键]：画笔涂鸦 / [L 键]：激光笔</div>
              </div>
              <span className="ribbon-group-title">操作提示</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
