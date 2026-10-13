import { DEBUG } from 'BuildProfile';
import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { Constants } from '../services/Constants';
import { DocumentBridge } from '../services/DocumentBridge';
import { EditorAssets } from '../services/EditorAssets';
import { Logger } from '../services/Logger';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private context: common.UIAbilityContext = this.getUIContext().getHostContext() as common.UIAbilityContext;
  private bridge: DocumentBridge = new DocumentBridge(this.context);
  private assets: EditorAssets = new EditorAssets(this.context);
  private isControllerReady: boolean = false;
  aboutToAppear(): void {
    webview.WebviewController.setWebDebuggingAccess(DEBUG);
  }
  private dispatch(script: string): void {
    if (!this.isControllerReady) { return; }
    try {
      this.controller.runJavaScript(script).catch(() => { Logger.error('Dispatch editor event'); });
    } catch {
      Logger.error('Access editor controller');
    }
  }
  onPageShow(): void {
    this.dispatch("window.dispatchEvent(new Event('online'))");
  }
  onBackPress(): boolean {
    this.dispatch("window.dispatchEvent(new CustomEvent('zhuole-harmony-command',{detail:'back'}))");
    return true;
  }
  build() {
    Column() {
      Web({ src: Constants.ORIGIN + '/', controller: this.controller })
        .onControllerAttached(() => { this.isControllerReady = true; })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(false)
        .mixedMode(MixedMode.None)
        .multiWindowAccess(false)
        .javaScriptProxy({ object: this.bridge, name: 'ZhuoleHarmony', methodList: ['getConnection'],
          asyncMethodList: ['openFile', 'saveFile', 'clearSession'], controller: this.controller })
        // ArkWeb documents null as network pass-through, but its callback type omits null.
        .onInterceptRequest((event) => this.assets.resolve(event.request)!)
        .onLoadIntercept((event) => event.data.isMainFrame() && event.data.getRequestUrl().split('#')[0] !== Constants.ORIGIN + '/')
        .width('100%')
        .height('100%')
    }.width('100%').height('100%').backgroundColor($r('app.color.launch_background'))
  }
}
