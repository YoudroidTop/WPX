import type { HttpResponse } from '@capacitor/core';

export function decodeNativeResponse(response: HttpResponse, binary: boolean): Response {
  const headers = new Headers(response.headers);
  const json = headers.get('content-type')?.includes('json');
  let body: BodyInit | null = null;
  if (response.status !== 204) {
    if (json) body = JSON.stringify(response.data);
    else if (binary)
      body = Uint8Array.from(atob(response.data), (character) => character.charCodeAt(0));
    else body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  }
  for (const header of ['set-cookie', 'content-encoding', 'content-length']) headers.delete(header);
  return new Response(body, { status: response.status, headers });
}
