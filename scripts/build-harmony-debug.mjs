import { cp, mkdir, mkdtemp, readFile, writeFile, rm, chmod } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';

const [referencePath, profilePath, toolPath, mode = 'debug', outputPath] = process.argv.slice(2);
if (!['debug', 'release'].includes(mode)) throw new Error('Invalid build mode');
if (!referencePath || !profilePath || !toolPath) {
  throw new Error(
    'Usage: node scripts/build-harmony-debug.mjs <reference-build-profile> <debug-profile> <hvigorw> [debug|release] [output-hap]',
  );
}
const source = resolve('harmony');
const reference = JSON.parse(await readFile(referencePath, 'utf8'));
const signing = reference.app.signingConfigs.find((config) => config.name === 'debug');
if (!signing?.material) throw new Error('Reference debug signing configuration unavailable');
const profile = JSON.parse(
  execFileSync(
    '/usr/bin/openssl',
    ['cms', '-verify', '-inform', 'DER', '-in', resolve(profilePath), '-noverify'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  ).toString(),
);
const app = JSON.parse(await readFile(join(source, 'AppScope/app.json5'), 'utf8'));
if (profile.type !== 'debug' || profile['bundle-info']['bundle-name'] !== app.app.bundleName) {
  throw new Error('Debug profile does not match this application');
}
const now = Date.now() / 1000;
if (now < profile.validity['not-before'] || now >= profile.validity['not-after']) {
  throw new Error('Debug profile is outside its validity period');
}
const expected = new X509Certificate(profile['bundle-info']['development-certificate']);
const certificates =
  (await readFile(signing.material.certpath, 'utf8')).match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
  ) || [];
if (
  !certificates.some((pem) => new X509Certificate(pem).fingerprint256 === expected.fingerprint256)
) {
  throw new Error('Signing certificate chain does not match the debug profile');
}
await mkdir('releases/harmony', { recursive: true });
const workspace = await mkdtemp(resolve('releases/harmony/debug-build-'));
await cp(source, workspace, {
  recursive: true,
  filter: (path) =>
    !relative(source, path)
      .split(/[\\/]/)
      .some((part) => ['build', '.hvigor', 'oh_modules', 'local.properties'].includes(part)),
});
const configPath = join(workspace, 'build-profile.json5');
const config = JSON.parse(await readFile(configPath, 'utf8'));
config.app.signingConfigs = [
  { ...signing, name: 'debug', material: { ...signing.material, profile: resolve(profilePath) } },
];
config.app.products[0].signingConfig = 'debug';
try {
  await chmod(configPath, 0o600);
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  // Logs stay local because third-party build diagnostics may contain signing context.
  const output = execFileSync(resolve(toolPath), ['assembleHap', '-p', `buildMode=${mode}`], {
    cwd: workspace,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await writeFile(join(workspace, 'build.log'), output, { mode: 0o600 });
  await cp(
    join(workspace, 'entry/build/default/outputs/default/entry-default-signed.hap'),
    outputPath || `releases/harmony/ZhuoleDocs-${app.app.versionName}-harmony-debug.hap`,
  );
  console.log(`Signed development HAP ready: ${outputPath || 'releases/harmony'}`);
} catch (error) {
  await writeFile(
    join(workspace, 'build.log'),
    Buffer.concat([error.stdout || Buffer.alloc(0), error.stderr || Buffer.alloc(0)]),
    { mode: 0o600 },
  );
  throw new Error(
    'Development signing failed; inspect the local build workspace without sharing signing material',
  );
} finally {
  await rm(configPath, { force: true });
}
