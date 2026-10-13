export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
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
    throw new RequestError(body.error || '请求失败', response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function downloadLocal(name: string, content: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.zdoc`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadFile(id: string, name: string, extension: string) {
  const response = await fetch(
    `/api/documents/${id}/export${extension === 'zdoc' ? '?format=zdoc' : ''}`,
  );
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
