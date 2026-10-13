import { common } from '@kit.AbilityKit';
import { util } from '@kit.ArkTS';
import { Constants } from './Constants';
import { Logger } from './Logger';

export class EditorAssets {
  private context: common.UIAbilityContext;
  private files: Set<string>;
  constructor(context: common.UIAbilityContext) {
    this.context = context;
    const data: Uint8Array = context.resourceManager.getRawFileContentSync('web-manifest.json');
    const decoder: util.TextDecoder = util.TextDecoder.create('utf-8');
    this.files = new Set(JSON.parse(decoder.decodeToString(data)) as string[]);
  }
  resolve(request: WebResourceRequest): WebResourceResponse | null {
    const address: string = request.getRequestUrl();
    if (!address.startsWith(Constants.ORIGIN + '/')) {
      return null;
    }
    const path: string = address.substring(Constants.ORIGIN.length).split('?')[0].split('#')[0];
    if (path.startsWith('/api/')) {
      return null;
    }
    const file: string = path === '/' ? '/index.html' : path;
    const response: WebResourceResponse = new WebResourceResponse();
    if (!this.files.has(file)) {
      response.setResponseCode(404);
      response.setResponseData(
        this.context.resourceManager.getStringSync($r('app.string.editor_not_found').id),
      );
      response.setResponseIsReady(true);
      return response;
    }
    try {
      const bytes: Uint8Array = this.context.resourceManager.getRawFileContentSync('web' + file);
      response.setResponseData(bytes.buffer);
      response.setResponseCode(200);
      response.setReasonMessage('OK');
      response.setResponseEncoding('utf-8');
      const extension: string = file.split('.').pop() ?? '';
      const types: Record<string, string> = {
        'html': 'text/html',
        'js': 'text/javascript',
        'css': 'text/css',
        'svg': 'image/svg+xml',
      };
      response.setResponseMimeType(types[extension] ?? 'application/octet-stream');
      const headers: Header[] = [
        {
          headerKey: 'Content-Security-Policy',
          headerValue:
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-src 'none'; base-uri 'self'",
        },
      ];
      response.setResponseHeader(headers);
      response.setResponseIsReady(true);
      return response;
    } catch {
      Logger.error('Read bundled editor');
      response.setResponseCode(500);
      response.setResponseData(
        this.context.resourceManager.getStringSync($r('app.string.editor_unavailable').id),
      );
      response.setResponseIsReady(true);
      return response;
    }
  }
}
