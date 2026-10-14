import { ApiError } from '../server/errors';
import type { AccountWriteAdmission } from './write-admission';

// All document read routes (including usage and export) must use the account's
// non-restored coordinator. A pre-request check alone cannot fence slow reads.
export class CoordinatedReads {
  constructor(private admission: AccountWriteAdmission) {}

  async response(load: () => Promise<Response>): Promise<Response> {
    const before = this.admission.status();
    if (before.phase !== 'active' && before.phase !== 'draining') this.unavailable();
    const source = await load();
    // Materialize before rechecking; returning an unconsumed stream would let
    // document reads continue after the coordinator's recovery boundary.
    const bytes = source.body ? await source.arrayBuffer() : null;
    const after = this.admission.status();
    if (
      after.phase !== before.phase ||
      after.highWaterMark !== before.highWaterMark ||
      after.pending !== before.pending ||
      after.recovery !== before.recovery
    )
      this.unavailable();
    return new Response(bytes, {
      status: source.status,
      statusText: source.statusText,
      headers: source.headers,
    });
  }

  private unavailable(): never {
    throw new ApiError(503, '文档正在恢复或更新，请稍后重新打开');
  }
}
