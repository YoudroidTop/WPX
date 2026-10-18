import { useState, useRef } from 'react';
import {
  X,
  Upload,
  Link as LinkIcon,
  Table as TableIcon,
  BarChart2,
  LineChart,
  PieChart,
  Square,
  Circle,
  Triangle,
  ArrowRight,
  ArrowLeft,
  Star,
  MessageSquare,
  Minus,
  Sparkles,
  Check,
  Search,
  Briefcase,
  Layers,
  Cpu,
  Target,
  Award,
  Zap,
  Globe,
  TrendingUp,
  FileText,
  Users,
} from 'lucide-react';
import type { ShapeKind, SlideLayout } from './types';
import { LAYOUT_PRESETS } from './types';

// Preset sample photos for rapid rich presentation authoring
export const PRESET_IMAGES = [
  {
    name: '商务现代办公室',
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: '团队头脑风暴',
    url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: '极简科技笔记本',
    url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: '数据分析与大屏',
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: '宏伟城市天际线',
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: '创意构思与草图',
    url: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=1200&q=80',
  },
];

// Curated icons for presentation cards and nodes
export const ICON_LIBRARY = [
  { name: 'Target', label: '目标定位', component: Target },
  { name: 'TrendingUp', label: '业绩增长', component: TrendingUp },
  { name: 'Zap', label: '高效迅捷', component: Zap },
  { name: 'Award', label: '品质荣誉', component: Award },
  { name: 'Briefcase', label: '商务办公', component: Briefcase },
  { name: 'Layers', label: '架构层次', component: Layers },
  { name: 'Cpu', label: '前沿算力', component: Cpu },
  { name: 'Globe', label: '全球化', component: Globe },
  { name: 'Users', label: '协作团队', component: Users },
  { name: 'FileText', label: '文档方案', component: FileText },
  { name: 'Sparkles', label: '创新亮点', component: Sparkles },
  { name: 'Check', label: '完备交付', component: Check },
];

export function ImageModal({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (url: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'upload' | 'url' | 'presets'>('upload');
  const [inputUrl, setInputUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onConfirm(reader.result);
          onClose();
        }
      };
      reader.readAsDataURL(file);
    }
  }

  return (
    <div className="slide-modal-backdrop" onClick={onClose}>
      <div className="slide-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="slide-modal-header">
          <h3>插入图片</h3>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="slide-modal-tabs">
          <button
            className={`slide-modal-tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <Upload size={14} /> 本地上传
          </button>
          <button
            className={`slide-modal-tab ${activeTab === 'presets' ? 'active' : ''}`}
            onClick={() => setActiveTab('presets')}
          >
            <Sparkles size={14} /> 推荐图库
          </button>
          <button
            className={`slide-modal-tab ${activeTab === 'url' ? 'active' : ''}`}
            onClick={() => setActiveTab('url')}
          >
            <LinkIcon size={14} /> 网络链接
          </button>
        </div>

        <div className="slide-modal-body">
          {activeTab === 'upload' && (
            <div className="slide-upload-dropzone" onClick={() => fileInputRef.current?.click()}>
              <Upload size={36} />
              <p>点击选择图片文件，或将图片拖拽至此处</p>
              <span>支持 JPG、PNG、WebP、SVG 等格式</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFile}
              />
            </div>
          )}

          {activeTab === 'presets' && (
            <div className="slide-preset-grid">
              {PRESET_IMAGES.map((img) => (
                <div
                  key={img.url}
                  className="slide-preset-item"
                  onClick={() => {
                    onConfirm(img.url);
                    onClose();
                  }}
                >
                  <img src={img.url} alt={img.name} loading="lazy" />
                  <span>{img.name}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'url' && (
            <div className="slide-url-form">
              <label>图片直链 URL</label>
              <input
                type="url"
                value={inputUrl}
                placeholder="https://example.com/photo.jpg"
                onChange={(e) => setInputUrl(e.target.value)}
                autoFocus
              />
              <div className="slide-modal-actions">
                <button className="secondary" onClick={onClose}>
                  取消
                </button>
                <button
                  className="primary"
                  disabled={!inputUrl.trim()}
                  onClick={() => {
                    onConfirm(inputUrl.trim());
                    onClose();
                  }}
                >
                  确定插入
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TableModal({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (rows: number, cols: number) => void;
}) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [hoverRow, setHoverRow] = useState(0);
  const [hoverCol, setHoverCol] = useState(0);

  if (!isOpen) return null;

  return (
    <div className="slide-modal-backdrop" onClick={onClose}>
      <div className="slide-modal-card mini" onClick={(e) => e.stopPropagation()}>
        <div className="slide-modal-header">
          <h3>插入幻灯片表格</h3>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="slide-modal-body">
          <p className="muted" style={{ marginBottom: 12 }}>
            选择行列网格或手动指定（当前 {hoverRow || rows} 行 × {hoverCol || cols} 列）：
          </p>
          <div
            className="slide-table-matrix"
            onMouseLeave={() => {
              setHoverRow(0);
              setHoverCol(0);
            }}
          >
            {Array.from({ length: 6 }).map((_, r) => (
              <div key={r} className="matrix-row">
                {Array.from({ length: 6 }).map((_, c) => {
                  const active =
                    (hoverRow > 0 && r < hoverRow && c < hoverCol) ||
                    (!hoverRow && r < rows && c < cols);
                  return (
                    <div
                      key={c}
                      className={`matrix-cell ${active ? 'active' : ''}`}
                      onMouseEnter={() => {
                        setHoverRow(r + 1);
                        setHoverCol(c + 1);
                      }}
                      onClick={() => {
                        setRows(r + 1);
                        setCols(c + 1);
                        onConfirm(r + 1, c + 1);
                        onClose();
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <label style={{ flex: 1, fontSize: 13 }}>
              行数 (2-10)
              <input
                type="number"
                min={2}
                max={10}
                value={rows}
                onChange={(e) => setRows(Math.min(10, Math.max(2, Number(e.target.value) || 2)))}
              />
            </label>
            <label style={{ flex: 1, fontSize: 13 }}>
              列数 (2-8)
              <input
                type="number"
                min={2}
                max={8}
                value={cols}
                onChange={(e) => setCols(Math.min(8, Math.max(2, Number(e.target.value) || 2)))}
              />
            </label>
          </div>
          <div className="slide-modal-actions" style={{ marginTop: 20 }}>
            <button className="secondary" onClick={onClose}>
              取消
            </button>
            <button
              className="primary"
              onClick={() => {
                onConfirm(rows, cols);
                onClose();
              }}
            >
              插入表格
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChartModal({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    type: 'bar' | 'line' | 'pie',
    title: string,
    categories: string[],
    values: number[],
  ) => void;
}) {
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');
  const [title, setTitle] = useState('季度业务发展趋势');
  const [catsInput, setCatsInput] = useState('第一季度, 第二季度, 第三季度, 第四季度');
  const [valsInput, setValsInput] = useState('120, 190, 310, 480');

  if (!isOpen) return null;

  function handleSubmit() {
    const categories = catsInput
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const values = valsInput
      .split(/[,，]/)
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
    if (!categories.length || !values.length) return;
    onConfirm(chartType, title.trim() || '数据图表', categories, values);
    onClose();
  }

  return (
    <div className="slide-modal-backdrop" onClick={onClose}>
      <div className="slide-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="slide-modal-header">
          <h3>插入数据图表</h3>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="slide-modal-body">
          <div className="slide-chart-type-picker">
            <button
              className={`chart-type-btn ${chartType === 'bar' ? 'active' : ''}`}
              onClick={() => setChartType('bar')}
            >
              <BarChart2 size={24} />
              <span>柱状图</span>
            </button>
            <button
              className={`chart-type-btn ${chartType === 'line' ? 'active' : ''}`}
              onClick={() => setChartType('line')}
            >
              <LineChart size={24} />
              <span>折线图</span>
            </button>
            <button
              className={`chart-type-btn ${chartType === 'pie' ? 'active' : ''}`}
              onClick={() => setChartType('pie')}
            >
              <PieChart size={24} />
              <span>饼图</span>
            </button>
          </div>

          <label style={{ display: 'block', marginTop: 16 }}>
            图表标题
            <input
              type="text"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入图表标题"
            />
          </label>

          <label style={{ display: 'block', marginTop: 12 }}>
            分类类目（以逗号分隔）
            <input
              type="text"
              value={catsInput}
              onChange={(e) => setCatsInput(e.target.value)}
              placeholder="Q1, Q2, Q3, Q4"
            />
          </label>

          <label style={{ display: 'block', marginTop: 12 }}>
            数据数值（以逗号分隔，与分类对应）
            <input
              type="text"
              value={valsInput}
              onChange={(e) => setValsInput(e.target.value)}
              placeholder="100, 200, 300, 400"
            />
          </label>

          <div className="slide-modal-actions" style={{ marginTop: 24 }}>
            <button className="secondary" onClick={onClose}>
              取消
            </button>
            <button className="primary" onClick={handleSubmit}>
              确定插入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IconPickerModal({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (iconName: string) => void;
}) {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = ICON_LIBRARY.filter(
    (item) =>
      item.label.includes(search.trim()) ||
      item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="slide-modal-backdrop" onClick={onClose}>
      <div className="slide-modal-card mini" onClick={(e) => e.stopPropagation()}>
        <div className="slide-modal-header">
          <h3>选择矢量图标</h3>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="slide-modal-body">
          <div className="slide-search-box">
            <Search size={14} />
            <input
              type="text"
              value={search}
              placeholder="搜索图标名称…"
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="slide-icon-grid">
            {filtered.map((item) => {
              const IconComp = item.component;
              return (
                <button
                  key={item.name}
                  className="slide-icon-item"
                  onClick={() => {
                    onSelect(item.name);
                    onClose();
                  }}
                  title={item.label}
                >
                  <IconComp size={24} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LayoutPickerDropdown({
  currentLayout,
  onSelect,
  onClose,
}: {
  currentLayout?: SlideLayout;
  onSelect: (layout: SlideLayout) => void;
  onClose: () => void;
}) {
  return (
    <div className="slide-dropdown-menu layout-menu" onClick={(e) => e.stopPropagation()}>
      <div className="slide-dropdown-header">选择幻灯片版式</div>
      <div className="layout-grid">
        {LAYOUT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            className={`layout-card ${currentLayout === preset.id ? 'active' : ''}`}
            onClick={() => {
              onSelect(preset.id);
              onClose();
            }}
          >
            <div className="layout-thumb-preview">
              <span className={`layout-mock ${preset.id}`} />
            </div>
            <strong>{preset.name}</strong>
            <small>{preset.desc}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
