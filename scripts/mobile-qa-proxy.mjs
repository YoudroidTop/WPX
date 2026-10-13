import http from 'node:http';
import { createInterface } from 'node:readline';

// Dedicated loopback QA endpoint; never bind this fault injector publicly.
let offline = false;
const server = http.createServer((request, response) => {
  if (!request.url?.startsWith('/api/')) {
    response.writeHead(404).end();
    return;
  }
  if (offline) {
    request.socket.destroy();
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
      response.writeHead(incoming.statusCode, incoming.headers);
      incoming.pipe(response);
    },
  );
  upstream.on('error', () => response.destroy());
  request.pipe(upstream);
});
server.listen(3174, '127.0.0.1', () =>
  console.log('QA proxy ready on 127.0.0.1:3174; enter offline, online, or quit.'),
);
const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  if (line === 'quit') {
    input.close();
    server.close();
    server.closeAllConnections();
  } else if (line === 'offline' || line === 'online') {
    offline = line === 'offline';
    if (offline) server.closeAllConnections();
    console.log(`QA proxy ${line}.`);
  }
});
