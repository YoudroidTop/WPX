import { pruneExportCache } from './export-cache';
import { decodeNativeResponse } from './mobile-response';
import { Capacitor, CapacitorCookies, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
import { normalizeServer, safeFilename } from '../desktop/policy';
import type { NativeBridge } from './platform';

const inbox = registerPlugin<{
  take(): Promise<{ file: { name: string; data: string } | null }>;
  addListener(event: 'filesAvailable', callback: () => void): Promise<unknown>;
}>('DocumentInbox');

export const isMobile = Capacitor.isNativePlatform();
let origin = '';
const commands = new Set<(command: string) => void>();
export const sendMobileCommand = (command: string) =>
  commands.forEach((callback) => callback(command));
function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export async function mobileRequest(path: string, options: RequestInit = {}): Promise<Response> {
  if (!origin) throw new TypeError('Cloud connection unavailable');
  if (!path.startsWith('/api/')) throw new Error('Invalid API path');
  const headers = Object.fromEntries(new Headers(options.headers).entries());
  headers.Origin = origin;
  let data = options.body;
  let dataType: 'file' | undefined;
  if (data && typeof data !== 'string') {
    const bytes = new Uint8Array(await new Response(data).arrayBuffer());
    if (bytes.length > 10_000_000) throw new Error('文件超过 10 MB');
    data = encode(bytes);
    dataType = 'file';
  }
  let response;
  try {
    response = await CapacitorHttp.request({
      url: `${origin}${path}`,
      method: options.method || 'GET',
      headers,
      data: data ?? undefined,
      dataType,
      responseType: path.includes('/export') ? 'arraybuffer' : 'json',
      connectTimeout: 15_000,
      readTimeout: 15_000,
      disableRedirects: true,
    });
  } catch {
    throw new TypeError('Cloud connection unavailable');
  }
  return decodeNativeResponse(response, path.includes('/export'));
}
export const mobileBridge: NativeBridge = {
  async getConnection() {
    const stored = await Preferences.get({ key: 'cloud-origin' });
    if (stored.value) origin = normalizeServer(stored.value);
    return { origin, version: (await App.getInfo()).version, platform: Capacitor.getPlatform() };
  },
  async connect(input) {
    const next = normalizeServer(input);
    const result = await CapacitorHttp.get({
      url: `${next}/api/health`,
      responseType: 'json',
      disableRedirects: true,
      connectTimeout: 10_000,
      readTimeout: 10_000,
    });
    if (result.status !== 200 || result.data?.service !== 'zhuole-docs')
      throw new Error('该地址不是可用的卓乐云文档服务');
    await Preferences.set({ key: 'cloud-origin', value: next });
    origin = next;
    return { origin, version: (await App.getInfo()).version, platform: Capacitor.getPlatform() };
  },
  async clearSession() {
    await CapacitorCookies.clearCookies({ url: origin });
  },
  async pendingFiles() {
    const { file } = await inbox.take();
    return file
      ? {
          name: file.name,
          bytes: Uint8Array.from(atob(file.data), (character) => character.charCodeAt(0)),
        }
      : null;
  },
  async openFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.docx,.xlsx,.pptx,.zdoc';
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.addEventListener(
        'change',
        async () => {
          const file = input.files?.[0];
          resolve(
            file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null,
          );
        },
        { once: true },
      );
      input.click();
    });
  },
  async saveFile(name, extension, bytes) {
    const file = await Filesystem.writeFile({
      directory: Directory.Cache,
      path: `exports/${crypto.randomUUID()}/${safeFilename(name)}.${extension}`,
      recursive: true,
      data: encode(bytes),
    });
    const cleanup = await pruneExportCache({
      list: async (path) => (await Filesystem.readdir({ directory: Directory.Cache, path })).files,
      removeFile: async (path) => {
        await Filesystem.deleteFile({ directory: Directory.Cache, path });
      },
      removeDirectory: async (path) => {
        await Filesystem.rmdir({ directory: Directory.Cache, path, recursive: false });
      },
    });
    if (cleanup.failed) console.warn('Some expired export copies could not be removed');
    const result = await Share.share({
      title: name,
      files: [file.uri],
      dialogTitle: '保存或分享文档',
    });
    // A receiving app may read the shared URI after the chooser has closed.
    return Boolean(result.activityType);
  },
  onCommand(callback) {
    commands.add(callback);
    return () => {
      commands.delete(callback);
    };
  },
};
if (isMobile) {
  document.documentElement.classList.add('native-mobile');
  void inbox.addListener('filesAvailable', () => sendMobileCommand('pending-files'));

  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event('online'));
  });
  void App.addListener('backButton', () => sendMobileCommand('back'));
}
