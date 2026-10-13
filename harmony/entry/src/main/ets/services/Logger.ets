import { hilog } from '@kit.PerformanceAnalysisKit';
export class Logger {
  static error(operation: string): void {
    hilog.error(0x0000, 'ZhuoleDocs', '%{public}s failed', operation);
  }
}
