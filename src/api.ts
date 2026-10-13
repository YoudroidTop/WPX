import { isMobile, mobileRequest } from './mobile';
import { cacheRead, cacheResponse, forgetAccount, offlineAccount, setOffline } from './cache';
import { isNative, nativeBridge } from './platform';
const request = (path: string, options?: RequestInit) =>
  isMobile ? mobileRequest(path, options) : fetch(path, options);
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method ?? 'GET';
  try {
    const response = await request(`/api${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body && typeof options.body === 'string'
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers,
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: '网络请求失败' }));
      if (response.status === 401 && path !== '/auth/login') await forgetAccount();
      throw new RequestError(
        body.error || '请求失败',
        body.code === 'OFFLINE' ? 0 : response.status,
      );
    }
    setOffline(false);
    const value = response.status === 204 ? undefined : await response.json();
    if (path === '/auth/login' || path === '/auth/register') await nativeBridge?.persistSession?.();
    await cacheResponse(path, value, method).catch(() => {
      /* Cloud success remains authoritative when a cache is unavailable. */
    });
    if (path === '/auth/logout') await nativeBridge?.clearSession();
    return value as T;
  } catch (error) {
    const networkFailure =
      error instanceof TypeError || (error instanceof RequestError && error.status === 0);
    if (isNative && networkFailure) {
      setOffline(true);
      if (path === '/auth/logout') {
        await nativeBridge!.clearSession();
        await forgetAccount();
        return undefined as T;
      }
      if (method === 'GET') {
        const cached = path === '/me' ? await offlineAccount() : await cacheRead(path);
        if (cached) return cached as T;
      }
      throw new RequestError('云服务暂不可用；尚未缓存的文档需要联网打开', 0);
    }
    throw error;
  }
}
async function saveBytes(name: string, extension: string, bytes: Uint8Array) {
  if (nativeBridge) return nativeBridge.saveFile(name, extension, bytes);
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
export async function downloadLocal(name: string, content: unknown) {
  return saveBytes(name, 'zdoc', new TextEncoder().encode(JSON.stringify(content, null, 2)));
}
export async function downloadFile(id: string, name: string, extension: string) {
  const response = await request(
    `/api/documents/${id}/export${extension === 'zdoc' ? '?format=zdoc' : ''}`,
  );
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error);
  }
  return saveBytes(name, extension, new Uint8Array(await response.arrayBuffer()));
}
