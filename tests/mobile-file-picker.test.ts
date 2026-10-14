import test from 'node:test';
import assert from 'node:assert/strict';
import { pickMobileFile } from '../src/mobile-file-picker';
import { MAX_IMPORT_BYTES } from '../shared/documents';

function picker(file?: Pick<File, 'name' | 'size' | 'arrayBuffer'>, event = 'change') {
  const input = Object.assign(new EventTarget(), {
    type: '',
    accept: '',
    files: file ? [file] : [],
    click() {
      queueMicrotask(() => input.dispatchEvent(new Event(event)));
    },
  });
  return () => input as unknown as HTMLInputElement;
}

test('mobile selection returns bytes at the import limit and preserves the filename', async () => {
  const bytes = new Uint8Array(MAX_IMPORT_BYTES);
  bytes[bytes.length - 1] = 42;
  const result = await pickMobileFile(picker(new File([bytes], 'Budget.xlsx')));
  assert.equal(result?.name, 'Budget.xlsx');
  assert.deepEqual(result?.bytes, bytes);
});

test('mobile selection rejects oversized files before asking the provider for bytes', async () => {
  let reads = 0;
  await assert.rejects(
    pickMobileFile(
      picker({
        name: 'Large.docx',
        size: MAX_IMPORT_BYTES + 1,
        async arrayBuffer() {
          reads++;
          return new ArrayBuffer(0);
        },
      }),
    ),
    /10 MB/,
  );
  assert.equal(reads, 0);
});

test('provider read failure rejects the selection and a later selection can succeed', async () => {
  const error = new Error('Provider is unavailable');
  await assert.rejects(
    pickMobileFile(
      picker({
        name: 'Offline.pptx',
        size: 10,
        async arrayBuffer() {
          throw error;
        },
      }),
    ),
    (actual) => actual === error,
  );
  const result = await pickMobileFile(picker(new File(['recovered'], 'Recovered.zdoc')));
  assert.equal(new TextDecoder().decode(result?.bytes), 'recovered');
});

test('cancel and empty selection settle without a file', async () => {
  assert.equal(await pickMobileFile(picker(undefined, 'cancel')), null);
  assert.equal(await pickMobileFile(picker()), null);
});
