export type WordRibbonTab = 'home' | 'insert' | 'page' | 'review' | 'view';

export type WordMarginType = 'normal' | 'narrow' | 'moderate' | 'wide';
export type WordOrientationType = 'portrait' | 'landscape';
export type WordPaperSizeType = 'a4' | 'a3' | 'letter';

export interface WordPageSettings {
  margin: WordMarginType;
  orientation: WordOrientationType;
  paperSize: WordPaperSizeType;
  columns: 1 | 2 | 3;
  backgroundColor: string;
  watermark: string;
}

export interface WordViewSettings {
  showRuler: boolean;
  eyeCare: boolean;
  zoom: number; // e.g. 0.75, 0.9, 1.0, 1.25, 1.5
  zenMode: boolean;
  showOutline: boolean;
  readOnly: boolean;
  mobileReflow: boolean; // Mobile responsive reflow view
}

export interface WordHeadingItem {
  id: string;
  level: number;
  text: string;
  pos: number;
}
