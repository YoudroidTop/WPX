export const LOCAL_URL = 'zhuole://app/';
export function isAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'zhuole:' &&
      url.hostname === 'app' &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}
export function normalizeServer(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('请输入有效的云服务地址');
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('地址必须包含 https://');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('请使用 HTTPS 服务根地址；本机调试可使用 HTTP 回环地址');
  return url.origin;
}
export const fileExtensions = ['docx', 'xlsx', 'pptx', 'zdoc'];
export function safeFilename(value: string): string {
  return (
    value
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/[. ]+$/, '')
      .slice(0, 150) || 'document'
  );
}
