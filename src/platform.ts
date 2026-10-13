export interface NativeFile {
  name: string;
  bytes: Uint8Array;
}
export interface DesktopConnection {
  origin: string;
  version: string;
  platform: string;
}
declare global {
  interface Window {
    zhuoleDesktop?: {
      getConnection(): Promise<DesktopConnection>;
      connect(origin: string): Promise<DesktopConnection>;
      openFile(): Promise<NativeFile | null>;
      pendingFiles(): Promise<NativeFile | null>;
      saveFile(name: string, extension: string, bytes: Uint8Array): Promise<boolean>;
      clearSession(): Promise<void>;
      onCommand(callback: (command: string) => void): () => void;
    };
  }
}
export const isDesktop = Boolean(window.zhuoleDesktop);
export function nativeCommand(callback: (command: string) => void) {
  return window.zhuoleDesktop?.onCommand(callback) ?? (() => {});
}
export async function openNativeFile(pending = false): Promise<File | null> {
  const data = pending
    ? await window.zhuoleDesktop?.pendingFiles()
    : await window.zhuoleDesktop?.openFile();
  return data
    ? new File([new Uint8Array(data.bytes)], data.name, { type: 'application/octet-stream' })
    : null;
}
