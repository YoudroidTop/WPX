import { MAX_IMPORT_BYTES } from '../shared/documents';
import type { NativeFile } from './platform';

export function pickMobileFile(
  createInput: () => HTMLInputElement = () => document.createElement('input'),
): Promise<NativeFile | null> {
  return new Promise((resolve, reject) => {
    const input = createInput();
    input.type = 'file';
    input.accept = '.docx,.xlsx,.pptx,.zdoc';
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        // Reject before allocating the full file, including files from providers.
        if (file.size > MAX_IMPORT_BYTES) {
          reject(new Error('文件超过 10 MB'));
          return;
        }
        void file
          .arrayBuffer()
          .then((bytes) => resolve({ name: file.name, bytes: new Uint8Array(bytes) }), reject);
      },
      { once: true },
    );
    input.click();
  });
}
