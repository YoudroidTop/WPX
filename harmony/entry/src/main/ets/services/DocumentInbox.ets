import { common } from '@kit.AbilityKit';
import { fileIo } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { Constants } from './Constants';
import { DocumentBytes, DocumentFiles } from './DocumentFiles';
import { Logger } from './Logger';

export class DocumentInbox {
  private static work: Promise<void> = Promise.resolve();
  private static hasFailure: boolean = false;
  private static async directory(context: common.UIAbilityContext): Promise<string> {
    const directory: string = context.filesDir + '/' + Constants.INBOX_DIRECTORY;
    if (!await fileIo.access(directory)) {
      await fileIo.mkdir(directory);
    }
    // A serialized operation cannot own a live partial copy at this boundary.
    for (const name of await fileIo.listFile(directory)) {
      if (/^\d+-[a-f0-9-]{36}_.+\.(docx|xlsx|pptx|zdoc)\.part$/i.test(name)) {
        await fileIo.unlink(directory + '/' + name);
      }
    }
    return directory;
  }
  private static async entries(directory: string): Promise<string[]> {
    const entries: string[] = await fileIo.listFile(directory);
    return entries.filter((name: string) => /^\d+-[a-f0-9-]{36}_.+\.(docx|xlsx|pptx|zdoc)$/i.test(name)).sort();
  }
  static receive(context: common.UIAbilityContext, uri: string): Promise<void> {
    DocumentInbox.work = DocumentInbox.work.then(async (): Promise<void> => {
      if (!uri.startsWith('file://')) {
        throw new Error('Unsupported incoming URI');
      }
      const directory: string = await DocumentInbox.directory(context);
      if ((await DocumentInbox.entries(directory)).length >= Constants.MAX_INBOX_FILES) {
        throw new Error('Document inbox full');
      }
      const document: DocumentBytes = await DocumentFiles.read(uri);
      const name: string = document.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
      if (name.length > 120) {
        throw new Error('Incoming filename too long');
      }
      const target: string = directory + '/' + Date.now() + '-' + util.generateRandomUUID() + '_' + name;
      const temporary: string = target + '.part';
      try {
        const file: fileIo.File = await fileIo.open(temporary, fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.CREATE);
        try {
          if (await fileIo.write(file.fd, document.bytes) !== document.bytes.byteLength) {
            throw new Error('Incomplete inbox write');
          }
          await fileIo.fsync(file.fd);
        } finally {
          await fileIo.close(file.fd);
        }
        await fileIo.rename(temporary, target);
      } catch {
        if (await fileIo.access(temporary)) {
          await fileIo.unlink(temporary);
        }
        throw new Error('Unable to persist incoming document');
      }
    }).catch((): void => {
      DocumentInbox.hasFailure = true;
      Logger.error('Receive incoming document');
    });
    return DocumentInbox.work;
  }
  static take(context: common.UIAbilityContext): Promise<string> {
    let result: string = '';
    const operation: Promise<void> = DocumentInbox.work.then(async (): Promise<void> => {
      if (DocumentInbox.hasFailure) {
        DocumentInbox.hasFailure = false;
        throw new Error('Incoming document unavailable');
      }
      const directory: string = await DocumentInbox.directory(context);
      const names: string[] = await DocumentInbox.entries(directory);
      if (!names.length) { return; }
      const path: string = directory + '/' + names[0];
      const document: DocumentBytes = await DocumentFiles.read(path);
      document.name = names[0].slice(names[0].indexOf('_') + 1);
      result = DocumentFiles.encode(document);
      await fileIo.unlink(path);
    });
    DocumentInbox.work = operation.catch((): void => { Logger.error('Read incoming document'); });
    return operation.then((): string => result);
  }
}
