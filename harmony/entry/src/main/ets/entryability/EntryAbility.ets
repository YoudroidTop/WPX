import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { Constants } from '../services/Constants';
import { Logger } from '../services/Logger';
export default class EntryAbility extends UIAbility {
  onWindowStageCreate(stage: window.WindowStage): void {
    stage.loadContent(Constants.PAGE).catch(() => {
      Logger.error('Load editor window');
    });
  }
}
