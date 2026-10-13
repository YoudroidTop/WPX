import type { NativeBridge } from './platform';
import { DEFAULT_CLOUD_ORIGIN } from '../shared/service';
import { normalizeServer } from '../desktop/policy';
interface HarmonyProxy {
  getConnection(): string;
  openFile(): Promise<string>;
  saveFile(name: string, extension: string, data: string): Promise<boolean>;
  clearSession(): Promise<void>;
  persistSession(): Promise<void>;
}
declare global {
  interface Window {
    ZhuoleHarmony?: HarmonyProxy;
  }
}
export const isHarmony = Boolean(window.ZhuoleHarmony);
const proxy = () => {
  if (!window.ZhuoleHarmony) throw new Error('Harmony bridge unavailable');
  return window.ZhuoleHarmony;
};
export const harmonyBridge: NativeBridge = {
  async getConnection() {
    return JSON.parse(proxy().getConnection());
  },
  async connect(origin) {
    if (normalizeServer(origin) !== DEFAULT_CLOUD_ORIGIN)
      throw new Error('当前鸿蒙版本使用卓乐云文档正式服务');
    return JSON.parse(proxy().getConnection());
  },
  async openFile() {
    try {
      const encoded = await proxy().openFile();
      if (!encoded) return null;
      const file = JSON.parse(encoded) as { name: string; data: string };
      return {
        name: file.name,
        bytes: Uint8Array.from(atob(file.data), (value) => value.charCodeAt(0)),
      };
    } catch {
      throw new Error('无法读取文件，请选择不超过 10 MB 的 DOCX、XLSX、PPTX 或 ZDOC 文件');
    }
  },
  async pendingFiles() {
    return null;
  },
  async saveFile(name, extension, bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    try {
      return await proxy().saveFile(name, extension, btoa(binary));
    } catch {
      throw new Error('文件未保存，请重新选择保存位置');
    }
  },
  async persistSession() {
    try {
      await proxy().persistSession();
    } catch {
      throw new Error('登录状态未能保存到设备，请重试');
    }
  },
  async clearSession() {
    await proxy().clearSession();
  },
  onCommand(callback) {
    const listener = (event: Event) => callback((event as CustomEvent<string>).detail);
    window.addEventListener('zhuole-harmony-command', listener);
    return () => window.removeEventListener('zhuole-harmony-command', listener);
  },
};
if (isHarmony) document.documentElement.classList.add('native-mobile');
