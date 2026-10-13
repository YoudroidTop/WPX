import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

// Execute the actual ArkTS service against a filesystem-backed CoreFileKit adapter.
const handles = new Map<number, fs.FileHandle>();
let nextHandle = 1;
let shortWrite = false;
const fileIo = {
  OpenMode: { READ_ONLY: 0, WRITE_ONLY: 1, CREATE: 2 },
  async open(path: string, mode: number) {
    const fd = nextHandle++;
    handles.set(
      fd,
      await fs.open(path.startsWith('file://') ? fileURLToPath(path) : path, mode ? 'wx' : 'r'),
    );
    return { fd };
  },
  async close(fd: number) {
    await handles.get(fd)!.close();
    handles.delete(fd);
  },
  async stat(fd: number) {
    return handles.get(fd)!.stat();
  },
  async read(fd: number, buffer: ArrayBuffer) {
    return (await handles.get(fd)!.read(new Uint8Array(buffer))).bytesRead;
  },
  async write(fd: number, buffer: ArrayBuffer) {
    if (shortWrite) return 0;
    return (await handles.get(fd)!.write(new Uint8Array(buffer))).bytesWritten;
  },
  async fsync(fd: number) {
    await handles.get(fd)!.sync();
  },
  async access(path: string) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  },
  mkdir: fs.mkdir,
  listFile: fs.readdir,
  rename: fs.rename,
  unlink: fs.unlink,
};
Object.assign(globalThis, {
  inboxTestKit: {
    fileIo,
    util: {
      generateRandomUUID: randomUUID,
      Base64Helper: class {
        encodeToStringSync(bytes: Uint8Array) {
          return Buffer.from(bytes).toString('base64');
        }
      },
    },
    hilog: { error() {} },
  },
});
const compiled = await build({
  entryPoints: ['harmony/entry/src/main/ets/services/DocumentInbox.ets'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  loader: { '.ets': 'ts' },
  resolveExtensions: ['.ets', '.ts', '.js'],
  plugins: [
    {
      name: 'native-kit-test-adapter',
      setup(builder) {
        builder.onResolve({ filter: /^@kit\./ }, (args) => ({ path: args.path, namespace: 'kit' }));
        builder.onLoad({ filter: /.*/, namespace: 'kit' }, () => ({
          contents: 'export const {fileIo,util,hilog}=globalThis.inboxTestKit;',
          loader: 'js',
        }));
      },
    },
  ],
});
type Inbox = {
  receive(context: { filesDir: string }, uri: string): Promise<void>;
  take(context: { filesDir: string }): Promise<string>;
};
const loadInbox = async (): Promise<Inbox> =>
  (
    await import(
      'data:text/javascript;base64,' +
        Buffer.from(compiled.outputFiles[0].text).toString('base64') +
        '#' +
        randomUUID()
    )
  ).DocumentInbox;

test('Harmony inbox persists bounded copies, consumes once and never changes sources', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'zhuole-inbox-'));
  const context = { filesDir: join(root, 'private') };
  await fs.mkdir(context.filesDir);
  try {
    let inbox = await loadInbox();
    assert.equal(await inbox.take(context), '');
    const bytes = Buffer.from([0, 255, 128, 10, 42]);
    const source = join(root, '预算%25_计划.docx');
    await fs.writeFile(source, bytes);
    await inbox.receive(context, pathToFileURL(source).href);
    inbox = await loadInbox();
    const result = JSON.parse(await inbox.take(context));
    assert.equal(result.name, '预算%25_计划.docx');
    assert.deepEqual(Buffer.from(result.data, 'base64'), bytes);
    assert.deepEqual(await fs.readFile(source), bytes);
    assert.equal(await inbox.take(context), '');
    await Promise.all(
      Array.from({ length: 8 }, () => inbox.receive(context, pathToFileURL(source).href)),
    );
    await inbox.receive(context, pathToFileURL(source).href);
    await assert.rejects(inbox.take(context), /Incoming document unavailable/);
    for (let index = 0; index < 8; index++) assert.ok(await inbox.take(context));
    assert.equal(await inbox.take(context), '');
    const directory = join(context.filesDir, 'document-inbox');
    const stale = `${Date.now()}-${randomUUID()}_interrupted.docx.part`;
    await fs.writeFile(join(directory, stale), 'partial');
    await fs.writeFile(join(directory, 'unrelated.txt'), 'keep');
    assert.equal(await inbox.take(context), '');
    assert.deepEqual(await fs.readdir(directory), ['unrelated.txt']);
    shortWrite = true;
    await inbox.receive(context, pathToFileURL(source).href);
    shortWrite = false;
    await assert.rejects(inbox.take(context), /Incoming document unavailable/);
    assert.deepEqual(await fs.readdir(directory), ['unrelated.txt']);
    for (const [name, size] of [
      ['empty.docx', 0],
      ['large.xlsx', 10000001],
      ['wrong.txt', 5],
    ] as const) {
      const path = join(root, name);
      await fs.writeFile(path, Buffer.alloc(size));
      await inbox.receive(context, pathToFileURL(path).href);
      await assert.rejects(inbox.take(context), /Incoming document unavailable/);
    }
    for (const extension of ['xlsx', 'pptx', 'zdoc']) {
      const path = join(root, `roundtrip.${extension}`);
      await fs.writeFile(path, bytes);
      await inbox.receive(context, pathToFileURL(path).href);
      assert.deepEqual(Buffer.from(JSON.parse(await inbox.take(context)).data, 'base64'), bytes);
    }
    const boundary = join(root, 'boundary.docx');
    await fs.writeFile(boundary, Buffer.alloc(10000000));
    await inbox.receive(context, pathToFileURL(boundary).href);
    assert.equal(
      Buffer.from(JSON.parse(await inbox.take(context)).data, 'base64').length,
      10000000,
    );
    const folder = join(root, 'directory.docx');
    await fs.mkdir(folder);
    await inbox.receive(context, pathToFileURL(folder).href);
    await assert.rejects(inbox.take(context), /Incoming document unavailable/);
    await inbox.receive(context, 'https://example.com/file.docx');
    await assert.rejects(inbox.take(context), /Incoming document unavailable/);
    assert.equal(handles.size, 0);
  } finally {
    shortWrite = false;
    await fs.rm(root, { recursive: true, force: true });
  }
});
