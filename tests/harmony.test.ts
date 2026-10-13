import assert from 'node:assert/strict';
import test from 'node:test';

const events = new EventTarget();
let incoming = '';
let pending = '';
let pendingFailure = false;
let saved: { name: string; extension: string; data: string } | undefined;
let cleared = false;
let persisted = false;
const classes = new Set<string>();
Object.assign(globalThis, {
  window: Object.assign(events, {
    ZhuoleHarmony: {
      getConnection: () =>
        JSON.stringify({
          origin: 'https://wpx.youdroid.top',
          platform: 'harmony',
          version: '0.1.0',
        }),
      openFile: async () => incoming,
      pendingFiles: async () => {
        if (pendingFailure) throw new Error('Native inbox rejected input');
        const value = pending;
        pending = '';
        return value;
      },
      saveFile: async (name: string, extension: string, data: string) => {
        saved = { name, extension, data };
        return true;
      },
      persistSession: async () => {
        persisted = true;
      },
      clearSession: async () => {
        cleared = true;
      },
    },
  }),
  document: { documentElement: { classList: { add: (name: string) => classes.add(name) } } },
});
const { harmonyBridge, isHarmony } = await import('../src/harmony');

test('Harmony bridge preserves binary Office bytes and restricts its fixed service origin', async () => {
  assert.equal(isHarmony, true);
  assert.ok(classes.has('native-mobile'));
  assert.equal((await harmonyBridge.getConnection()).platform, 'harmony');
  await assert.rejects(harmonyBridge.connect('https://other.example.com'));
  assert.equal(
    (await harmonyBridge.connect('https://wpx.youdroid.top/')).origin,
    'https://wpx.youdroid.top',
  );
  assert.equal(await harmonyBridge.openFile(), null);
  assert.equal(await harmonyBridge.pendingFiles(), null);
  const bytes = Uint8Array.from({ length: 20000 }, (_, index) => index % 256);
  incoming = JSON.stringify({ name: '季度计划.docx', data: Buffer.from(bytes).toString('base64') });
  assert.deepEqual(await harmonyBridge.openFile(), { name: '季度计划.docx', bytes });
  pending = incoming;
  assert.deepEqual(await harmonyBridge.pendingFiles(), { name: '季度计划.docx', bytes });
  assert.equal(await harmonyBridge.pendingFiles(), null);
  pendingFailure = true;
  await assert.rejects(harmonyBridge.pendingFiles(), /无法接收文件/);
  pendingFailure = false;
  assert.equal(await harmonyBridge.saveFile('Quarterly plan', 'docx', bytes), true);
  assert.deepEqual(Buffer.from(saved!.data, 'base64'), Buffer.from(bytes));
  assert.equal(saved!.extension, 'docx');
  incoming = '{invalid';
  await assert.rejects(harmonyBridge.openFile(), /无法读取文件/);
  await harmonyBridge.persistSession!();
  assert.equal(persisted, true);
  await harmonyBridge.clearSession();
  assert.equal(cleared, true);
  let command = '';
  const remove = harmonyBridge.onCommand((value) => {
    command = value;
  });
  events.dispatchEvent(new CustomEvent('zhuole-harmony-command', { detail: 'back' }));
  assert.equal(command, 'back');
  remove();
  events.dispatchEvent(new CustomEvent('zhuole-harmony-command', { detail: 'connection' }));
  assert.equal(command, 'back');
});
