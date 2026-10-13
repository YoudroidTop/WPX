import { fileIo } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { Constants } from './Constants';

export interface DocumentBytes {
  name: string;
  bytes: ArrayBuffer;
}
export class DocumentFiles {
  static async read(uri: string): Promise<DocumentBytes> {
    const basename: string = uri.split('/').pop() ?? 'document';
    const name: string = uri.startsWith('file://') ? decodeURIComponent(basename) : basename;
    if (!/\.(docx|xlsx|pptx|zdoc)$/i.test(name)) {
      throw new Error('Unsupported document format');
    }
    const file: fileIo.File = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY);
    try {
      const stat: fileIo.Stat = await fileIo.stat(file.fd);
      if (!stat.isFile() || stat.size <= 0 || stat.size > Constants.MAX_FILE_BYTES) {
        throw new Error('Invalid document size');
      }
      const bytes: ArrayBuffer = new ArrayBuffer(stat.size);
      const count: number = await fileIo.read(file.fd, bytes);
      if (count !== stat.size) {
        throw new Error('Incomplete file read');
      }
      return { name: name, bytes: bytes };
    } finally {
      await fileIo.close(file.fd);
    }
  }
  static encode(document: DocumentBytes): string {
    return JSON.stringify({
      name: document.name,
      data: new util.Base64Helper().encodeToStringSync(new Uint8Array(document.bytes)),
    });
  }
}
