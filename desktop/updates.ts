import { z } from 'zod';

export const UPDATE_ORIGIN = 'https://wpx.youdroid.top';
const version = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
  .max(32);
const releaseSchema = z.object({
  version,
  artifacts: z
    .array(
      z.object({
        platform: z.enum(['mac', 'win']),
        architecture: z.enum(['arm64', 'x64']),
        filename: z.string(),
        bytes: z.number().int().positive().max(1_000_000_000),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        signed: z.boolean(),
        path: z.string(),
      }),
    )
    .min(1)
    .max(4),
});

export function newerVersion(candidate: string, current: string): boolean {
  const left = version.parse(candidate).split('.').map(BigInt);
  const right = version.parse(current).split('.').map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i];
  }
  return false;
}

export function selectUpdate(
  input: unknown,
  current: string,
  platform: string,
  architecture: string,
) {
  const release = releaseSchema.parse(input);
  const target = platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : null;
  const seen = new Set<string>();
  for (const artifact of release.artifacts) {
    const filename = `ZhuoleDocs-${release.version}-${artifact.platform}-${artifact.architecture}.${artifact.platform === 'mac' ? 'dmg' : 'exe'}`;
    const key = `${artifact.platform}-${artifact.architecture}`;
    if (
      seen.has(key) ||
      artifact.filename !== filename ||
      artifact.path !== `/downloads/desktop/${release.version}/${filename}` ||
      (artifact.platform === 'mac' && !artifact.signed)
    ) {
      throw new Error('Invalid release artifact');
    }
    seen.add(key);
  }
  const artifact = release.artifacts.find(
    (a) => a.platform === target && a.architecture === architecture,
  );
  if (!artifact) throw new Error('Unsupported update platform');
  return {
    available: newerVersion(release.version, current),
    version: release.version,
    signed: artifact.signed,
    url: UPDATE_ORIGIN + artifact.path,
  };
}

export async function readUpdateManifest(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('Update service unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) throw new Error('Update manifest too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
