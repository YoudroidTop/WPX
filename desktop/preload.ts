import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('zhuoleDesktop', {
  clearSession: () => ipcRenderer.invoke('desktop:clear-session'),
  getConnection: () => ipcRenderer.invoke('desktop:connection'),
  connect: (origin: string) => ipcRenderer.invoke('desktop:connect', origin),
  openFile: () => ipcRenderer.invoke('desktop:open-file'),
  saveFile: (name: string, extension: string, bytes: Uint8Array) =>
    ipcRenderer.invoke('desktop:save-file', { name, extension, bytes }),
  pendingFiles: () => ipcRenderer.invoke('desktop:pending-files'),
  onCommand: (callback: (command: string) => void) => {
    const listener = (_event: unknown, command: string) => callback(command);
    ipcRenderer.on('desktop:command', listener);
    return () => ipcRenderer.removeListener('desktop:command', listener);
  },
});
