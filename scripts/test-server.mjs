import { spawn } from 'node:child_process';
const port = process.argv[2] || '4173';
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: port,
    DATA_DIR: `./test-results/${process.argv[3] || 'e2e-db'}`,
    APP_ORIGIN: `http://127.0.0.1:${port}`,
  },
});
child.on('exit', (code) => process.exit(code || 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
