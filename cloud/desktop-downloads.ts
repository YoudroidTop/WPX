import release from './desktop-release.json';
import history from './desktop-release-history.json';

interface DownloadObject {
  size: number;
  body: ReadableStream<Uint8Array>;
}
interface DownloadBucket {
  get(
    key: string,
    options?: { range: { offset: number; length: number } },
  ): Promise<DownloadObject | null>;
  head(key: string): Promise<{ size: number } | null>;
}
export async function desktopDownload(
  request: Request,
  bucket?: DownloadBucket,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (path === '/api/releases/desktop')
    return Response.json(
      {
        version: release.version,
        artifacts: release.artifacts.map(({ key, ...artifact }) => artifact),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  const artifact = [release, ...history]
    .flatMap((entry) => entry.artifacts)
    .find((entry) => entry.path === path);
  if (!artifact) return new Response(null, { status: 404 });
  if (!bucket) return new Response(null, { status: 503 });
  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${artifact.filename}"`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: `"${artifact.sha256}"`,
    'X-Checksum-SHA256': artifact.sha256,
  });
  let offset = 0;
  let length = artifact.bytes;
  const range = request.headers.get('Range');
  const ifRange = request.headers.get('If-Range');
  const partial =
    request.method === 'GET' && !!range && (!ifRange || ifRange === headers.get('ETag'));
  if (partial) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range!);
    let end = artifact.bytes - 1;
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${artifact.bytes}` },
      });
    if (match[1]) {
      offset = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), end);
    } else {
      const suffix = Number(match[2]);
      offset = Math.max(0, artifact.bytes - suffix);
      if (!Number.isSafeInteger(suffix) || suffix <= 0) offset = artifact.bytes;
    }
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset > end)
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${artifact.bytes}` },
      });
    length = end - offset + 1;
    headers.set('Content-Range', `bytes ${offset}-${end}/${artifact.bytes}`);
  }
  const object =
    request.method === 'HEAD'
      ? await bucket.head(artifact.key)
      : await bucket.get(artifact.key, partial ? { range: { offset, length } } : undefined);
  if (!object || object.size !== artifact.bytes) return new Response(null, { status: 503 });
  headers.set('Content-Length', String(length));
  return new Response('body' in object ? (object.body as ReadableStream<Uint8Array>) : null, {
    status: partial ? 206 : 200,
    headers,
  });
}
