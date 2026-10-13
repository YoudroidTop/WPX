import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Cloud, Check, ArrowRight } from 'lucide-react';
import { api } from '../api';
import type { Account } from '../../shared/documents';
import { Logo, KindIcon } from './ui';
export default function Auth({ onLogin }: { onLogin: (account: Account) => void }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
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
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <Logo />
        <div className="story-main">
          <span className="eyebrow">A LITTLE SPACE. ENDLESS POSSIBILITIES.</span>
          <h1>
            让每一个想法，
            <br />
            都有生长的地方<span>。</span>
          </h1>
          <p>
            从第一行文字，到下一次精彩呈现。
            <br />
            你的文档、表格与演示，在这里自然相连。
          </p>
          <div className="paper-scene" aria-hidden="true">
            <div className="scene-sheet">
              <KindIcon kind="sheet" />
              <strong>把灵感，变成计划</strong>
              <div className="scene-grid">
                {Array.from({ length: 20 }, (_, i) => (
                  <span key={i} />
                ))}
              </div>
              <span className="scene-check">
                <Check size={16} /> 一切井然有序
              </span>
            </div>
            <div className="scene-doc">
              <KindIcon kind="word" />
              <span className="scene-kicker">MY NEXT CHAPTER</span>
              <h3>
                好想法
                <br />
                从这里开始。
              </h3>
              <div className="paper-lines">
                <i />
                <i />
                <i />
              </div>
              <div className="scene-bottom">
                <span>卓乐云文档</span>
                <ArrowUpRight size={22} />
              </div>
            </div>
            <div className="scene-slide">
              <KindIcon kind="slide" />
              <span>
                Make it
                <br />
                <b>remarkable.</b>
              </span>
              <div className="slide-orbit" />
            </div>
          </div>
        </div>
        <div className="story-footer">
          <Cloud size={17} /> 文字 · 表格 · 演示 <span>一个空间，随时续写</span>
        </div>
      </section>
      <section className="auth-form-side">
        <span className="edition-label">卓乐文档 / WEB EDITION</span>
        <div className="auth-form-wrap">
          <span className="small-tag">为你的创造留一个位置</span>
          <h2>{register ? '开启你的云端工作空间' : '欢迎回来'}</h2>
          <p>
            {register ? '创建账号，即可拥有 3 GB 专属云空间。' : '登录卓乐云文档，继续你的好想法。'}
          </p>
          <form onSubmit={submit}>
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
            <button className="primary auth-submit" disabled={busy}>
              {busy ? '请稍候…' : register ? '创建账号' : '登录'}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? '已有账号？' : '还没有账号？'}
            <button
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
        <p className="auth-footnote">专注于创作，其余交给卓乐。</p>
      </section>
    </div>
  );
}
