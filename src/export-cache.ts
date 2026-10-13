export const EXPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
interface Entry {
  name: string;
  type: string;
  mtime: number;
}
export interface ExportCacheStorage {
  list(path: string): Promise<Entry[]>;
  removeFile(path: string): Promise<void>;
  removeDirectory(path: string): Promise<void>;
}
const generatedDirectory = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exportFile = /^[^/\\\x00-\x1f]+\.(docx|xlsx|pptx|zdoc)$/i;

export async function pruneExportCache(storage: ExportCacheStorage, now = Date.now()) {
  const result = { removed: 0, failed: 0 };
  const cutoff = now - EXPORT_RETENTION_MS;
  const expired = (entry: Entry) =>
    Number.isFinite(entry.mtime) && entry.mtime > 0 && entry.mtime < cutoff;
  try {
    for (const directory of await storage.list('exports')) {
      if (
        directory.type !== 'directory' ||
        !generatedDirectory.test(directory.name) ||
        !expired(directory)
      )
        continue;
      const path = `exports/${directory.name}`;
      try {
        const files = await storage.list(path);
        // Never recursively remove a directory: unexpected contents are preserved.
        if (
          files.length !== 1 ||
          files[0].type !== 'file' ||
          !exportFile.test(files[0].name) ||
          !expired(files[0])
        )
          continue;
        await storage.removeFile(`${path}/${files[0].name}`);
        result.removed++;
        await storage.removeDirectory(path);
      } catch {
        result.failed++;
      }
    }
  } catch {
    result.failed++;
  }
  return result;
}
