import type {
  Slide,
  SlideContent,
  SlideLayout,
  SlideTheme,
  SlideTransition,
  SlideBackground,
  SlideCardItem,
  SlideElementBase,
} from '../../../shared/documents';

export type {
  Slide,
  SlideContent,
  SlideLayout,
  SlideTheme,
  SlideTransition,
  SlideBackground,
  SlideCardItem,
  SlideElementBase,
};

export type SlideRibbonTab = 'home' | 'insert' | 'design' | 'transition' | 'view' | 'slideshow';

export type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'circle'
  | 'triangle'
  | 'arrowRight'
  | 'arrowLeft'
  | 'star'
  | 'callout'
  | 'line';

export interface SlideShapeElement extends SlideElementBase {
  type: 'shape';
  kind: ShapeKind;
  fill?: string;
  border?: string;
  borderWidth?: number;
  text?: string;
  textColor?: string;
  fontSize?: number;
  opacity?: number;
}

export interface SlideTextElement extends SlideElementBase {
  type: 'text';
  content: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify';
  fill?: string;
}

export interface SlideImageElement extends SlideElementBase {
  type: 'image';
  src: string;
  alt?: string;
  border?: string;
  borderRadius?: number;
}

export interface SlideTableElement extends SlideElementBase {
  type: 'table';
  rows: number;
  cols: number;
  data: string[][];
  headerRow?: boolean;
}

export interface SlideChartElement extends SlideElementBase {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie';
  title?: string;
  categories: string[];
  series: { name: string; values: number[] }[];
}

export type SlideElement =
  SlideShapeElement | SlideTextElement | SlideImageElement | SlideTableElement | SlideChartElement;

export interface ThemePreset {
  id: SlideTheme;
  name: string;
  bg: string;
  text: string;
  accent: string;
  surface: string;
  previewGradient?: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'forest',
    name: '森绿雅致',
    bg: '#eaf1e9',
    text: '#174c3b',
    accent: '#2f855a',
    surface: '#ffffff',
    previewGradient: 'linear-gradient(135deg, #eaf1e9 0%, #d5e5d3 100%)',
  },
  {
    id: 'paper',
    name: '极简素雅',
    bg: '#faf8f3',
    text: '#2b342d',
    accent: '#4a5568',
    surface: '#ffffff',
    previewGradient: 'linear-gradient(135deg, #faf8f3 0%, #efebe1 100%)',
  },
  {
    id: 'midnight',
    name: '暗夜极光',
    bg: '#172a33',
    text: '#f3f1e9',
    accent: '#38bdf8',
    surface: '#1e3845',
    previewGradient: 'linear-gradient(135deg, #172a33 0%, #0d1b22 100%)',
  },
  {
    id: 'ocean',
    name: '科技深蓝',
    bg: '#0f172a',
    text: '#f8fafc',
    accent: '#3b82f6',
    surface: '#1e293b',
    previewGradient: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
  },
  {
    id: 'crimson',
    name: '热忱朱红',
    bg: '#fff1f2',
    text: '#881337',
    accent: '#e11d48',
    surface: '#ffffff',
    previewGradient: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
  },
  {
    id: 'amber',
    name: '活力暖阳',
    bg: '#fffbeb',
    text: '#78350f',
    accent: '#d97706',
    surface: '#ffffff',
    previewGradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
  },
  {
    id: 'lavender',
    name: '典雅紫韵',
    bg: '#f5f3ff',
    text: '#4c1d95',
    accent: '#7c3aed',
    surface: '#ffffff',
    previewGradient: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
  },
  {
    id: 'slate',
    name: '现代高级灰',
    bg: '#f1f5f9',
    text: '#334155',
    accent: '#64748b',
    surface: '#ffffff',
    previewGradient: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
  },
];

export interface LayoutPreset {
  id: SlideLayout;
  name: string;
  desc: string;
  iconName: string;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: 'title', name: '封面标题', desc: '醒目大标题与演讲主副标', iconName: 'Heading1' },
  { id: 'content', name: '标题与正文', desc: '标准讲解内容展示', iconName: 'AlignLeft' },
  { id: 'two-column', name: '双栏对比', desc: '左右对照两列结构', iconName: 'Columns2' },
  { id: 'three-card', name: '三列卡片', desc: '特性卡片、要点并列', iconName: 'Columns3' },
  { id: 'timeline', name: '流程时间线', desc: '4 阶段发展历程或业务流程', iconName: 'Milestone' },
  { id: 'big-image', name: '图文展示', desc: '左文右图生动展现', iconName: 'Image' },
  { id: 'quote', name: '金句引用', desc: '强调核心洞见与名言', iconName: 'Quote' },
  { id: 'blank', name: '空白画布', desc: '自由排版与图形创意', iconName: 'Square' },
];

export const TRANSITION_PRESETS: { id: SlideTransition; name: string }[] = [
  { id: 'none', name: '无切换' },
  { id: 'fade', name: '淡入淡出' },
  { id: 'slide', name: '平移推进' },
  { id: 'zoom', name: '中心缩放' },
  { id: 'flip', name: '卡片翻转' },
];

export interface SlideViewSettings {
  zoom: number; // 0.5, 0.75, 1, 1.25, 1.5, or fit (0)
  showGrid: boolean;
  showRuler: boolean;
  showNotes: boolean;
  slideSorterOpen: boolean;
}

export interface DrawingStroke {
  color: string;
  size: number;
  points: { x: number; y: number }[];
}
