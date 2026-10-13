import { common } from '@kit.AbilityKit';
import { fileIo, picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { webview } from '@kit.ArkWeb';
import { Constants } from './Constants';

interface IncomingFile {
  name: string;
  data: string;
}
export class DocumentBridge {
  private context: common.UIAbilityContext;
  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }
  getConnection(): string {
    return JSON.stringify({ origin: Constants.ORIGIN, version: '0.1.0', platform: 'harmony' });
  }
  async openFile(): Promise<string> {
    const selector: picker.DocumentViewPicker = new picker.DocumentViewPicker(this.context);
    const options: picker.DocumentSelectOptions = new picker.DocumentSelectOptions();
    options.maxSelectNumber = 1;
    const selected: string[] = await selector.select(options);
    if (!selected.length) {
      return '';
    }
    const uri: string = selected[0];
    const name: string = decodeURIComponent(uri.split('/').pop() ?? 'document');
    if (!/\.(docx|xlsx|pptx|zdoc)$/i.test(name)) {
      throw new Error('Unsupported document format');
    }
    const file: fileIo.File = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY);
    try {
      const stat: fileIo.Stat = await fileIo.stat(file.fd);
      if (stat.size <= 0 || stat.size > Constants.MAX_FILE_BYTES) {
        throw new Error('Invalid document size');
      }
      const data: ArrayBuffer = new ArrayBuffer(stat.size);
      const count: number = await fileIo.read(file.fd, data);
      if (count !== stat.size) {
        throw new Error('Incomplete file read');
      }
      const result: IncomingFile = {
        name: name,
        data: new util.Base64Helper().encodeToStringSync(new Uint8Array(data)),
      };
      return JSON.stringify(result);
    } finally {
      await fileIo.close(file.fd);
    }
  }
  async saveFile(name: string, extension: string, encoded: string): Promise<boolean> {
    if (!/^(docx|xlsx|pptx|zdoc)$/.test(extension) || encoded.length > 14000000) {
      throw new Error('Invalid export');
    }
    const bytes: Uint8Array = new util.Base64Helper().decodeSync(encoded);
    if (bytes.byteLength > Constants.MAX_FILE_BYTES) {
      throw new Error('Invalid export size');
    }
    const safeName: string =
      name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) || 'document';
    const selector: picker.DocumentViewPicker = new picker.DocumentViewPicker(this.context);
    const options: picker.DocumentSaveOptions = new picker.DocumentSaveOptions();
    options.newFileNames = [safeName + '.' + extension];
    const selected: string[] = await selector.save(options);
    if (!selected.length) {
      return false;
    }
    const file: fileIo.File = await fileIo.open(
      selected[0],
      fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC,
    );
    try {
      const count: number = await fileIo.write(file.fd, bytes.buffer);
      if (count !== bytes.byteLength) {
        throw new Error('Incomplete file write');
      }
      return true;
    } finally {
      await fileIo.close(file.fd);
    }
  }
  async persistSession(): Promise<void> {
    await webview.WebCookieManager.saveCookieAsync();
  }
  async clearSession(): Promise<void> {
    await webview.WebCookieManager.clearAllCookies();
    await webview.WebCookieManager.saveCookieAsync();
  }
}
