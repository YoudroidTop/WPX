// Registration or login may already have committed a new session
// before document usage fails. Preserve its cookie even on a storage error so the
// next retry can authenticate; never invent an accurate-looking quota value.
export async function accountUsageResponse(
  authenticated: Response,
  account: { id: string; email: string; name: string },
  readUsage: () => Promise<Response>,
): Promise<Response> {
  let usage: Response;
  try {
    usage = await readUsage();
    if (usage.ok) {
      return new Response(JSON.stringify({ ...account, ...((await usage.json()) as object) }), {
        status: authenticated.status,
        headers: authenticated.headers,
      });
    }
  } catch {
    usage = Response.json(
      { error: '账号验证已完成，云空间暂时不可用，请稍后重试' },
      { status: 503 },
    );
  }
  const headers = new Headers(usage.headers);
  headers.delete('Set-Cookie');
  const cookie = authenticated.headers.get('Set-Cookie');
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(usage.body, { status: usage.status, statusText: usage.statusText, headers });
}
