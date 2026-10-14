import http from 'node:http';
import { createInterface } from 'node:readline';

// Dedicated loopback QA endpoint; never bind this fault injector publicly.
let mode = 'online';
const server = http.createServer((request, response) => {
  if (!request.url?.startsWith('/api/')) {
    response.writeHead(404).end();
    return;
  }
  if (mode === 'offline') {
    request.socket.destroy();
    return;
  }
  const storageUnavailable = mode === 'storage-unavailable';
  if (storageUnavailable && /^\/api\/documents(?:\/|$|\?)/.test(request.url)) {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'QA storage unavailable' }));
    request.resume();
    return;
  }
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: 3173,
      path: request.url,
      method: request.method,
      headers: { ...request.headers, host: '127.0.0.1:3173', origin: 'http://127.0.0.1:3173' },
    },
    (incoming) => {
      if (
        storageUnavailable &&
        incoming.statusCode >= 200 &&
        incoming.statusCode < 300 &&
        ['/api/me', '/api/auth/login', '/api/auth/register'].includes(request.url)
      ) {
        const chunks = [];
        incoming.on('data', (chunk) => chunks.push(chunk));
        incoming.on('end', () => {
          try {
            const account = JSON.parse(Buffer.concat(chunks).toString());
            const headers = { ...incoming.headers, 'content-type': 'application/json' };
            delete headers['content-length'];
            response.writeHead(503, headers);
            response.end(
              JSON.stringify({
                error: 'QA storage unavailable',
                code: 'ACCOUNT_STORAGE_UNAVAILABLE',
                account: { ...account, usedBytes: null },
              }),
            );
          } catch {
            response.destroy();
          }
        });
        incoming.on('error', () => response.destroy());
        return;
      }
      response.writeHead(incoming.statusCode, incoming.headers);
      incoming.pipe(response);
    },
  );
  upstream.on('error', () => response.destroy());
  request.pipe(upstream);
});
server.listen(3174, '127.0.0.1', () =>
  console.log(
    'QA proxy ready on 127.0.0.1:3174; enter offline, online, storage-unavailable, or quit.',
  ),
);
const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  if (line === 'quit') {
    input.close();
    process.stdin.pause();
    server.close();
    server.closeAllConnections();
  } else if (['offline', 'online', 'storage-unavailable'].includes(line)) {
    mode = line;
    if (mode === 'offline') server.closeAllConnections();
    console.log(`QA proxy ${line}.`);
  }
});
