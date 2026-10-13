import { isMobile, mobileBridge } from './mobile';
import { isHarmony, harmonyBridge } from './harmony';
export interface NativeFile {
  name: string;
  bytes: Uint8Array;
}
export interface DesktopConnection {
  origin: string;
  version: string;
  platform: string;
}
export interface NativeBridge {
  getConnection(): Promise<DesktopConnection>;
  connect(origin: string): Promise<DesktopConnection>;
  openFile(): Promise<NativeFile | null>;
  pendingFiles(): Promise<NativeFile | null>;
  saveFile(name: string, extension: string, bytes: Uint8Array): Promise<boolean>;
  clearSession(): Promise<void>;
  onCommand(callback: (command: string) => void): () => void;
}
declare global {
  interface Window {
    zhuoleDesktop?: NativeBridge;
  }
}
export const isDesktop = Boolean(window.zhuoleDesktop);
export const nativeBridge =
  window.zhuoleDesktop ?? (isHarmony ? harmonyBridge : isMobile ? mobileBridge : undefined);
export const isNative = Boolean(nativeBridge);
export function nativeCommand(callback: (command: string) => void) {
  return nativeBridge?.onCommand(callback) ?? (() => {});
}
export async function openNativeFile(pending = false): Promise<File | null> {
  const data = pending ? await nativeBridge?.pendingFiles() : await nativeBridge?.openFile();
  return data
    ? new File([new Uint8Array(data.bytes)], data.name, { type: 'application/octet-stream' })
    : null;
}
