import { useEffect, useState, type FormEvent } from 'react';
import {
  Download,
  Laptop,
  Smartphone,
  Check,
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  Sparkles,
  FileText,
  Table2,
  Presentation,
  Apple,
  ExternalLink,
} from 'lucide-react';
import { Logo, KindIcon } from './ui';
import { api } from '../api';
import type { Account, DocumentKind } from '../../shared/documents';

export interface DesktopArtifact {
  platform: 'mac' | 'win';
  architecture: 'arm64' | 'x64';
  filename: string;
  bytes: number;
  sha256: string;
  signed: boolean;
  path: string;
}

export interface DesktopReleaseInfo {
  version: string;
  artifacts: DesktopArtifact[];
}

// Default fallback release info matching current desktop-release.json
const FALLBACK_RELEASE: DesktopReleaseInfo = {
  version: '0.1.6',
  artifacts: [
    {
      platform: 'mac',
      architecture: 'arm64',
      filename: 'ZhuoleDocs-0.1.6-mac-arm64.dmg',
      bytes: 127571234,
      sha256: 'e59c0f239ef3302fd0b5224bca868d18b78b3624074825c222ac3938a3e7371f',
      signed: true,
      path: '/downloads/desktop/0.1.6/ZhuoleDocs-0.1.6-mac-arm64.dmg',
    },
    {
      platform: 'mac',
      architecture: 'x64',
      filename: 'ZhuoleDocs-0.1.6-mac-x64.dmg',
      bytes: 134469442,
      sha256: 'e898dc5b5ff2b06c87ef713d6e2fb18ded832269a4fe6bacde136722f6bca773',
      signed: true,
      path: '/downloads/desktop/0.1.6/ZhuoleDocs-0.1.6-mac-x64.dmg',
    },
    {
      platform: 'win',
      architecture: 'x64',
      filename: 'ZhuoleDocs-0.1.6-win-x64.exe',
      bytes: 111768246,
      sha256: '44a7ab6d6748868a32f5375d359c20bb42bfa78bf5546efcc5f9847a640f6071',
      signed: false,
      path: '/downloads/desktop/0.1.6/ZhuoleDocs-0.1.6-win-x64.exe',
    },
    {
      platform: 'win',
      architecture: 'arm64',
      filename: 'ZhuoleDocs-0.1.6-win-arm64.exe',
      bytes: 105453529,
      sha256: '30f886ce4d2058ef19875a0a965a3bde3650ae1c0d98f605f6ea2921dc29a001',
      signed: false,
      path: '/downloads/desktop/0.1.6/ZhuoleDocs-0.1.6-win-arm64.exe',
    },
  ],
};

// Mobile store links: currently default empty as requested
export const MOBILE_STORE_LINKS = {
  ios: '', // 缺省，待填 App Store 链接
  android: '', // 缺省，待填 Google Play 或国内 Android 应用商店链接
  harmony: '', // 缺省，待填 华为鸿蒙应用市场链接
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface LandingPageProps {
  onLogin: (account: Account) => void;
  onNotify: (message: string) => void;
}

export default function LandingPage({ onLogin, onNotify }: LandingPageProps) {
  const [release, setRelease] = useState<DesktopReleaseInfo>(FALLBACK_RELEASE);
  const [detectedOs, setDetectedOs] = useState<'mac' | 'win' | 'other'>('mac');
  const [showAllDownloads, setShowAllDownloads] = useState(false);
  const [activeTab, setActiveTab] = useState<DocumentKind>('word');

  // Inline auth form states
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Detect client OS
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) {
      setDetectedOs('mac');
    } else if (ua.includes('win')) {
      setDetectedOs('win');
    } else {
      setDetectedOs('other');
    }
  }, []);

  // Fetch desktop releases dynamically with fallback
  useEffect(() => {
    fetch('/api/releases/desktop')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load release manifest');
        return res.json() as Promise<DesktopReleaseInfo>;
      })
      .then((data) => {
        if (data?.artifacts?.length) setRelease(data);
      })
      .catch(() => {
        // Fallback already assigned in initial state
      });
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      onLogin(
        await api<Account>(`/auth/${register ? 'register' : 'login'}`, {
          method: 'POST',
          body: JSON.stringify(Object.fromEntries(data)),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const primaryArtifact =
    release.artifacts.find(
      (a) =>
        (detectedOs === 'win' ? a.platform === 'win' : a.platform === 'mac') &&
        (detectedOs === 'win' ? a.architecture === 'x64' : a.architecture === 'arm64'),
    ) || release.artifacts[0];

  const handleMobileStoreClick = (platform: 'ios' | 'android' | 'harmony', name: string) => {
    const url = MOBILE_STORE_LINKS[platform];
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      onNotify(`${name}应用正在商店审核与发布准备中，敬请期待！`);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="landing-container">
      {/* 顶部全局导航 */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <div className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo />
          </div>

          <nav className="landing-nav" aria-label="页面导览">
            <button type="button" onClick={() => scrollToSection('features')}>
              产品特性
            </button>
            <button type="button" onClick={() => scrollToSection('desktop-download')}>
              桌面客户端
            </button>
            <button type="button" onClick={() => scrollToSection('mobile-stores')}>
              移动端
            </button>
            <button type="button" onClick={() => scrollToSection('cloud-sync')}>
              云端同步
            </button>
          </nav>

          <div className="landing-actions">
            <a
              href="#desktop-download"
              className="landing-btn-desktop-quick"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('desktop-download');
              }}
            >
              <Download size={16} />
              <span>下载客户端</span>
            </a>
            <button
              type="button"
              className="landing-btn-login"
              onClick={() => {
                setRegister(false);
                scrollToSection('hero-auth');
              }}
            >
              网页版登录
            </button>
            <button
              type="button"
              className="landing-btn-register primary"
              onClick={() => {
                setRegister(true);
                scrollToSection('hero-auth');
              }}
            >
              免费体验
            </button>
          </div>
        </div>
      </header>

      {/* 首屏 Hero 区域 */}
      <section className="landing-hero-wrap">
        <div className="landing-hero-content">
          {/* Hero 左侧产品主张与下载入口 */}
          <div className="landing-hero-left">
            <div className="landing-hero-badge">
              <Sparkles size={14} />
              <span>全新桌面客户端 v{release.version} 正式发布</span>
            </div>

            <h1 className="landing-hero-title">
              让每一个想法，
              <br />
              都有生长的地方<span>。</span>
            </h1>

            <p className="landing-hero-subtitle">
              专为现代创作打造的轻量 Office 套件。将<strong>文字文档</strong>、<strong>电子表格</strong>与<strong>演示文稿</strong>收纳于一处，
              兼具极致轻量的原生桌面性能与顺畅的多端云同步。
            </p>

            {/* 核心桌面客户端下载行动 CTA */}
            <div className="landing-hero-download-block">
              <div className="landing-primary-download-group">
                <a
                  href={primaryArtifact.path}
                  download={primaryArtifact.filename}
                  className="landing-btn-download-hero"
                >
                  <Download size={19} />
                  <div className="landing-btn-download-text">
                    <strong>
                      下载 {primaryArtifact.platform === 'mac' ? 'macOS' : 'Windows'} 桌面客户端
                    </strong>
                    <small>
                      {primaryArtifact.platform === 'mac'
                        ? primaryArtifact.architecture === 'arm64'
                          ? 'Apple Silicon (M系列芯片)'
                          : 'Intel 芯片'
                        : '64 位 Windows'} · {formatFileSize(primaryArtifact.bytes)}
                    </small>
                  </div>
                </a>
                <button
                  type="button"
                  className="landing-btn-download-more"
                  aria-label="查看其他操作系统安装包"
                  onClick={() => setShowAllDownloads(!showAllDownloads)}
                >
                  <ChevronDown size={18} />
                </button>

                {showAllDownloads && (
                  <div className="landing-download-dropdown">
                    <div className="landing-dropdown-header">选择适合你设备的安装包：</div>
                    {release.artifacts.map((artifact) => (
                      <a
                        key={artifact.filename}
                        href={artifact.path}
                        download={artifact.filename}
                        className="landing-dropdown-item"
                        onClick={() => setShowAllDownloads(false)}
                      >
                        <div className="landing-item-icon">
                          {artifact.platform === 'mac' ? <Apple size={16} /> : <Laptop size={16} />}
                        </div>
                        <div className="landing-item-meta">
                          <span>
                            {artifact.platform === 'mac' ? 'macOS' : 'Windows'} (
                            {artifact.architecture === 'arm64'
                              ? artifact.platform === 'mac'
                                ? 'Apple Silicon'
                                : 'ARM64'
                              : 'x64 架构'}
                            )
                          </span>
                          <small>
                            {formatFileSize(artifact.bytes)}
                            {artifact.signed && ' · 官方签名已公证'}
                          </small>
                        </div>
                        <Download size={15} />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div className="landing-hero-guarantees">
                <span>
                  <Check size={14} /> 3 GB 专属免费云空间
                </span>
                <span>
                  <ShieldCheck size={14} /> 数据端到端加密存储
                </span>
                <span>
                  <Zap size={14} /> 离线可用，断网亦能编辑
                </span>
              </div>
            </div>
          </div>

          {/* Hero 右侧内嵌登录/注册卡片 */}
          <div id="hero-auth" className="landing-hero-auth-card">
            <span className="small-tag">为你的创造留一个位置</span>
            <h2>{register ? '开启你的云端工作空间' : '欢迎回来'}</h2>
            <p className="auth-subtext">
              {register
                ? '创建账号，即可拥有 3 GB 专属云空间。'
                : '登录卓乐云文档，继续你的好想法。'}
            </p>

            <form onSubmit={submitAuth} className="landing-auth-form">
              {register && (
                <label>
                  怎么称呼你
                  <input
                    autoComplete="name"
                    name="name"
                    placeholder="输入你的名字"
                    required
                    maxLength={100}
                  />
                </label>
              )}
              <label>
                邮箱地址
                <input
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
              <label>
                密码
                <input
                  name="password"
                  type="password"
                  placeholder={register ? '至少 10 位字符' : '输入你的密码'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  required
                  minLength={register ? 10 : 1}
                  maxLength={128}
                />
              </label>
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
              <button className="primary auth-submit landing-auth-submit" disabled={busy}>
                {busy ? '请稍候…' : register ? '创建账号' : '登录'}
                <ArrowRight size={18} />
              </button>
            </form>

            <p className="auth-switch">
              {register ? '已有账号？' : '还没有账号？'}
              <button
                type="button"
                onClick={() => {
                  setRegister(!register);
                  setError('');
                }}
              >
                {register ? '立即登录' : '创建免费账号'}
              </button>
            </p>

            <div className="auth-benefits">
              <span>
                <Check size={14} /> 3 GB 云空间
              </span>
              <span>
                <Check size={14} /> 三种文档，一站完成
              </span>
            </div>
          </div>
        </div>

        {/* 拟物/精细应用演示交互展台 */}
        <div className="landing-preview-window">
          <div className="landing-window-bar">
            <div className="landing-window-dots">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>
            <div className="landing-window-title">
              卓乐文档 · {activeTab === 'word' ? '季度战略思考.docx' : activeTab === 'sheet' ? '财务指标与增长预测.xlsx' : '2026产品发布会.pptx'}
            </div>
            <div className="landing-window-actions">
              <span className="tag-saved">已保存到云端</span>
            </div>
          </div>

          <div className="landing-window-tabs">
            <button
              className={`window-tab ${activeTab === 'word' ? 'active' : ''}`}
              onClick={() => setActiveTab('word')}
            >
              <KindIcon kind="word" small />
              <span>文字文档</span>
            </button>
            <button
              className={`window-tab ${activeTab === 'sheet' ? 'active' : ''}`}
              onClick={() => setActiveTab('sheet')}
            >
              <KindIcon kind="sheet" small />
              <span>电子表格</span>
            </button>
            <button
              className={`window-tab ${activeTab === 'slide' ? 'active' : ''}`}
              onClick={() => setActiveTab('slide')}
            >
              <KindIcon kind="slide" small />
              <span>演示文稿</span>
            </button>
          </div>

          <div className="landing-window-content">
            {activeTab === 'word' && (
              <div className="preview-sheet-body word-preview">
                <div className="doc-page-mock">
                  <h2>卓乐云文档：更专注的思考与书写</h2>
                  <p className="doc-lead">
                    去掉冗杂的按钮堆叠，回归纯粹的文字张力。无论是个人随想、调研总结，还是商业企划，都能在清爽的纸张画布中流畅流动。
                  </p>
                  <div className="doc-quote-mock">
                    “好的工具不喧宾夺主，它只是像清晨的纸和笔一样，随时等候你闪光的灵感。”
                  </div>
                  <div className="doc-checklist-mock">
                    <div className="check-item"><Check size={14} /> 原生兼容 Microsoft Word (.docx) 无损双向导入与导出</div>
                    <div className="check-item"><Check size={14} /> 支持 Markdown 快捷语法、富文本混排与智能表格</div>
                    <div className="check-item"><Check size={14} /> 沉浸式宽屏与纸质排版模式自由切换</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'sheet' && (
              <div className="preview-sheet-body sheet-preview">
                <div className="sheet-mock-table">
                  <div className="sheet-mock-row header-row">
                    <span className="col-idx">#</span>
                    <span className="col-name">月份</span>
                    <span className="col-rev">总收入 (万元)</span>
                    <span className="col-cost">研发支出 (万元)</span>
                    <span className="col-profit">净利润 (万元)</span>
                    <span className="col-status">达成率</span>
                  </div>
                  <div className="sheet-mock-row">
                    <span className="col-idx">1</span>
                    <span className="col-name">Q1 第一季度</span>
                    <span className="col-rev">¥ 1,280.00</span>
                    <span className="col-cost">¥ 640.00</span>
                    <span className="col-profit positive">¥ 640.00</span>
                    <span className="col-status"><span className="status-pill green">112%</span></span>
                  </div>
                  <div className="sheet-mock-row">
                    <span className="col-idx">2</span>
                    <span className="col-name">Q2 第二季度</span>
                    <span className="col-rev">¥ 1,650.00</span>
                    <span className="col-cost">¥ 720.00</span>
                    <span className="col-profit positive">¥ 930.00</span>
                    <span className="col-status"><span className="status-pill green">124%</span></span>
                  </div>
                  <div className="sheet-mock-row formula-row">
                    <span className="col-idx">Σ</span>
                    <span className="col-name"><strong>半年度合计</strong></span>
                    <span className="col-rev"><strong>=SUM(C2:C3)</strong></span>
                    <span className="col-cost"><strong>=SUM(D2:D3)</strong></span>
                    <span className="col-profit positive"><strong>¥ 1,570.00</strong></span>
                    <span className="col-status"><span className="status-pill gold">稳健</span></span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'slide' && (
              <div className="preview-sheet-body slide-preview">
                <div className="slide-deck-mock">
                  <div className="slide-card-item active">
                    <span className="slide-tag">01 · VISION</span>
                    <h3>让灵感，跨越设备自由生长</h3>
                    <p>告别繁杂的层叠动画调整，用卡片大纲理清演示逻辑，一键全屏汇报。</p>
                  </div>
                  <div className="slide-card-item">
                    <span className="slide-tag">02 · PERFORMANCE</span>
                    <h3>原生毫秒级响应</h3>
                    <p>Electron 架构与 WebWorker 算力深度调优，海量数据依然丝滑。</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 核心产品功能特性区 */}
      <section id="features" className="landing-section">
        <div className="section-head">
          <span className="section-eyebrow">FEATURES & CAPABILITIES</span>
          <h2>三大核心办公形态，浑然一体</h2>
          <p>无需在多个臃肿庞杂的软件间频繁跳转，一个空间，安放全部创造力。</p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-wrap word-theme">
              <FileText size={26} />
            </div>
            <h3>文字文档 · 专注排版</h3>
            <p>
              沉浸式写作环境，支持丰富段落样式、层级列表与嵌套表格。完美兼容 Word (.docx) 双向导出与导入，保留完整格式。
            </p>
            <ul className="feature-bullets">
              <li>支持无缝导入导出 .docx 格式</li>
              <li>Markdown 快捷语法即时渲染</li>
              <li>大纲目录一键跳转与字数统计</li>
            </ul>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrap sheet-theme">
              <Table2 size={26} />
            </div>
            <h3>电子表格 · 敏捷计算</h3>
            <p>
              内置丰富公式引擎，支持多工作表自由联动、单元格高亮着色、数据验证下拉菜单、多维排序与自动汇总计算。
            </p>
            <ul className="feature-bullets">
              <li>支持常用财务与统计公式</li>
              <li>多 Sheet 工作表与行列冻结锁定</li>
              <li>完美兼容 Excel (.xlsx) 导入导出</li>
            </ul>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrap slide-theme">
              <Presentation size={26} />
            </div>
            <h3>演示文稿 · 结构表达</h3>
            <p>
              创新的卡片式演示排版。告别花哨杂乱的幻灯片调整，以结构化视角梳理你的发言与汇报，支持随时全屏演示与导出。
            </p>
            <ul className="feature-bullets">
              <li>大纲驱动卡片式幻灯片构建</li>
              <li>支持一键全屏高质感放映</li>
              <li>支持导出为 PowerPoint (.pptx)</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 云端同步与离线支持介绍 */}
      <section id="cloud-sync" className="landing-section sync-section">
        <div className="sync-box">
          <div className="sync-content">
            <span className="section-eyebrow">OFFLINE CAPABLE & CLOUD PERSISTENCE</span>
            <h2>断网无忧，重连无感同步</h2>
            <p>
              即便在高铁、机舱或网络不稳定的场景下，卓乐云文档依然能完整离线运行。所有修改均妥善缓存在本地安全草稿箱，网络恢复后智能协同合并，绝不丢失任何一笔灵感。
            </p>
            <div className="sync-badges">
              <div className="sync-badge-item">
                <strong>3 GB</strong>
                <span>个人专属免费云存储</span>
              </div>
              <div className="sync-badge-item">
                <strong>Local Drafts</strong>
                <span>可靠 IndexedDB 本地草稿</span>
              </div>
              <div className="sync-badge-item">
                <strong>Auto Conflict</strong>
                <span>智能双向版本合并机制</span>
              </div>
            </div>
          </div>
          <div className="sync-visual">
            <div className="sync-card">
              <div className="sync-status-row">
                <Globe size={18} />
                <span>全平台同步引擎</span>
                <span className="sync-indicator">实时运转中</span>
              </div>
              <div className="sync-flow">
                <div className="flow-device">
                  <Laptop size={22} />
                  <span>桌面客户端</span>
                </div>
                <div className="flow-line" />
                <div className="flow-cloud">
                  <Logo compact />
                  <span>云空间</span>
                </div>
                <div className="flow-line" />
                <div className="flow-device">
                  <Smartphone size={22} />
                  <span>移动端</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 桌面客户端下载专区（核心重点） */}
      <section id="desktop-download" className="landing-section download-section">
        <div className="section-head">
          <span className="section-eyebrow">DESKTOP APPLICATION</span>
          <h2>下载卓乐文档桌面客户端</h2>
          <p>
            专为 macOS 与 Windows 深度打造的原生桌面端，更低延迟、更强本地文件读写与原生键盘快捷键支持。当前最新版本：<strong>v{release.version}</strong>
          </p>
        </div>

        <div className="desktop-cards-grid">
          {/* macOS 卡片 */}
          <div className="download-card mac-card">
            <div className="card-top">
              <div className="card-os-icon">
                <Apple size={36} />
              </div>
              <div className="card-os-meta">
                <h3>macOS 客户端</h3>
                <span>支持 macOS 12 Monterey 及更高版本</span>
              </div>
            </div>

            <p className="card-desc">
              适配 Apple Silicon 芯片原生指令集，深度融合 macOS 原生触控板手势与窗口毛玻璃效果，已通过 Apple 官方公证与签名。
            </p>

            <div className="card-download-actions">
              {release.artifacts
                .filter((a) => a.platform === 'mac')
                .map((artifact) => (
                  <a
                    key={artifact.filename}
                    href={artifact.path}
                    download={artifact.filename}
                    className="card-download-btn primary-download"
                  >
                    <Download size={17} />
                    <div className="btn-label-group">
                      <span className="btn-title">
                        {artifact.architecture === 'arm64'
                          ? '下载 Apple Silicon 版本 (M1/M2/M3/M4)'
                          : '下载 Intel 芯片版本 (x64)'}
                      </span>
                      <span className="btn-sub">
                        DMG 安装包 · {formatFileSize(artifact.bytes)} · 官方公证签名
                      </span>
                    </div>
                  </a>
                ))}
            </div>

            <div className="card-footer-tip">
              <ShieldCheck size={14} />
              <span>Apple Developer 官方公证，直接双击安装无系统未知来源拦截</span>
            </div>
          </div>

          {/* Windows 卡片 */}
          <div className="download-card win-card">
            <div className="card-top">
              <div className="card-os-icon">
                <Laptop size={36} />
              </div>
              <div className="card-os-meta">
                <h3>Windows 客户端</h3>
                <span>支持 Windows 10 / 11 64 位系统</span>
              </div>
            </div>

            <p className="card-desc">
              高性能本地渲染引擎，支持轻量级安装与无缝后台静默更新，适配各类高分屏与触摸屏笔记本电脑。
            </p>

            <div className="card-download-actions">
              {release.artifacts
                .filter((a) => a.platform === 'win')
                .map((artifact) => (
                  <a
                    key={artifact.filename}
                    href={artifact.path}
                    download={artifact.filename}
                    className="card-download-btn"
                  >
                    <Download size={17} />
                    <div className="btn-label-group">
                      <span className="btn-title">
                        {artifact.architecture === 'x64'
                          ? '下载 Windows 64 位版本 (x64)'
                          : '下载 Windows ARM64 版本'}
                      </span>
                      <span className="btn-sub">
                        EXE 安装包 · {formatFileSize(artifact.bytes)}
                      </span>
                    </div>
                  </a>
                ))}
            </div>

            <div className="card-footer-tip">
              <Check size={14} />
              <span>标准便携安装，开箱即用，无任何捆绑广告软件</span>
            </div>
          </div>
        </div>
      </section>

      {/* 移动端商店专区（地址先缺省） */}
      <section id="mobile-stores" className="landing-section mobile-section">
        <div className="section-head">
          <span className="section-eyebrow">MOBILE ECOSYSTEM</span>
          <h2>移动端应用商店下载</h2>
          <p>
            随时随地在手机与平板上查阅、批注与记录你的灵感。移动端正逐步推向各主流应用商店。
          </p>
        </div>

        <div className="mobile-stores-grid">
          {/* iOS App Store */}
          <div className="mobile-store-card">
            <div className="store-badge-icon ios-badge">
              <Apple size={30} />
            </div>
            <h3>Apple App Store</h3>
            <p>专为 iPhone & iPad 屏幕与触控手势优化，支持 Apple Pencil 便捷批注与分屏多任务。</p>
            <div className="store-status">
              <span className="status-badge pending">
                {MOBILE_STORE_LINKS.ios ? '已上架' : '即将上线 · 商店审核中'}
              </span>
            </div>
            <button
              type="button"
              className="store-cta-btn"
              onClick={() => handleMobileStoreClick('ios', 'iOS App Store')}
            >
              <span>{MOBILE_STORE_LINKS.ios ? '前往 App Store 下载' : 'App Store 商店预约'}</span>
              <ExternalLink size={15} />
            </button>
          </div>

          {/* Android 应用市场 */}
          <div className="mobile-store-card">
            <div className="store-badge-icon android-badge">
              <Smartphone size={30} />
            </div>
            <h3>Android 应用商店</h3>
            <p>适配各种主流 Android 手机与折叠屏设备，支持自由导入本地文档与一键微信分享。</p>
            <div className="store-status">
              <span className="status-badge pending">
                {MOBILE_STORE_LINKS.android ? '已上架' : '即将上线 · 敬请期待'}
              </span>
            </div>
            <button
              type="button"
              className="store-cta-btn"
              onClick={() => handleMobileStoreClick('android', 'Android')}
            >
              <span>{MOBILE_STORE_LINKS.android ? '前往应用商店下载' : 'Android 商店预约'}</span>
              <ExternalLink size={15} />
            </button>
          </div>

          {/* HarmonyOS 鸿蒙应用市场 */}
          <div className="mobile-store-card">
            <div className="store-badge-icon harmony-badge">
              <Zap size={30} />
            </div>
            <h3>HarmonyOS 鸿蒙元服务</h3>
            <p>基于 OpenHarmony 原生架构适配，支持华为平板键盘外设与跨端自由流转协作。</p>
            <div className="store-status">
              <span className="status-badge pending">
                {MOBILE_STORE_LINKS.harmony ? '已上架' : '即将上线 · 生态适配中'}
              </span>
            </div>
            <button
              type="button"
              className="store-cta-btn"
              onClick={() => handleMobileStoreClick('harmony', '华为鸿蒙应用市场')}
            >
              <span>{MOBILE_STORE_LINKS.harmony ? '前往华为应用市场下载' : '鸿蒙市场预约'}</span>
              <ExternalLink size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* 底部横幅 CTA */}
      <section className="landing-bottom-cta">
        <div className="bottom-cta-inner">
          <h2>随时开启你的专属创作空间</h2>
          <p>新用户即刻享有 3 GB 永久云空间，无需复杂配置，打开浏览器或下载客户端立即开始。</p>
          <div className="bottom-cta-buttons">
            <button
              type="button"
              className="bottom-btn-primary"
              onClick={() => {
                setRegister(true);
                scrollToSection('hero-auth');
              }}
            >
              免费创建账号
              <ArrowRight size={18} />
            </button>
            <button
              type="button"
              className="bottom-btn-secondary"
              onClick={() => {
                setRegister(false);
                scrollToSection('hero-auth');
              }}
            >
              已有账号？立即登录
            </button>
          </div>
        </div>
      </section>

      {/* 页脚 Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-left">
            <Logo />
            <p>卓乐云文档 · 让想法，自在生长。</p>
            <small>© {new Date().getFullYear()} Zhuole Docs. All rights reserved.</small>
          </div>
          <div className="footer-links">
            <div className="footer-col">
              <h4>客户端下载</h4>
              <a href="#desktop-download" onClick={(e) => { e.preventDefault(); scrollToSection('desktop-download'); }}>macOS 客户端</a>
              <a href="#desktop-download" onClick={(e) => { e.preventDefault(); scrollToSection('desktop-download'); }}>Windows 客户端</a>
              <a href="#mobile-stores" onClick={(e) => { e.preventDefault(); scrollToSection('mobile-stores'); }}>iOS App Store</a>
              <a href="#mobile-stores" onClick={(e) => { e.preventDefault(); scrollToSection('mobile-stores'); }}>Android 应用商店</a>
            </div>
            <div className="footer-col">
              <h4>产品功能</h4>
              <a href="#features" onClick={(e) => { e.preventDefault(); scrollToSection('features'); }}>Word 文字排版</a>
              <a href="#features" onClick={(e) => { e.preventDefault(); scrollToSection('features'); }}>Sheet 电子表格</a>
              <a href="#features" onClick={(e) => { e.preventDefault(); scrollToSection('features'); }}>Slide 演示文稿</a>
              <a href="#cloud-sync" onClick={(e) => { e.preventDefault(); scrollToSection('cloud-sync'); }}>离线草稿与云同步</a>
            </div>
            <div className="footer-col">
              <h4>在线服务</h4>
              <button
                type="button"
                className="footer-text-btn"
                onClick={() => {
                  setRegister(false);
                  scrollToSection('hero-auth');
                }}
              >
                网页版登录
              </button>
              <button
                type="button"
                className="footer-text-btn"
                onClick={() => {
                  setRegister(true);
                  scrollToSection('hero-auth');
                }}
              >
                注册新账号
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
