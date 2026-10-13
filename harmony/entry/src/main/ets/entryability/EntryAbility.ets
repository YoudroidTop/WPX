import { UIAbility, Want, AbilityConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { Constants } from '../services/Constants';
import { Logger } from '../services/Logger';
import { DocumentInbox } from '../services/DocumentInbox';
export default class EntryAbility extends UIAbility {
  onCreate(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    this.receive(want);
  }
  onNewWant(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    this.receive(want);
  }
  private receive(want: Want): void {
    if (want.action !== 'ohos.want.action.viewData' || !want.uri) { return; }
    void DocumentInbox.receive(this.context, want.uri).then((): void => {
      this.context.eventHub.emit(Constants.INBOX_EVENT);
    }).catch((): void => { Logger.error('Notify incoming document'); });
  }
  onWindowStageCreate(stage: window.WindowStage): void {
    stage.loadContent(Constants.PAGE).catch(() => {
      Logger.error('Load editor window');
    });
  }
}
