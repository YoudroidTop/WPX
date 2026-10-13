import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.youdroid.zhuoledocs',
  appName: '卓乐文档',
  webDir: 'dist',
  ios: { contentInset: 'never' },
  android: { allowMixedContent: false, minWebViewVersion: 111 },
  server: { errorPath: 'unsupported.html' },
  plugins: { Keyboard: { resize: 'body' } },
};
export default config;
