import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  readFile,
  writeFile,
  mkdir,
  lstat,
  chmod,
  realpath,
  mkdtemp,
  copyFile,
  access,
} from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const java = process.env.JAVA_HOME;
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!java || !sdk) throw new Error('JAVA_HOME and ANDROID_HOME are required');
const signing = resolve(
  process.env.ZHUOLE_ANDROID_SIGNING_DIR || join(homedir(), '.config/zhuole-docs/android-release'),
);
const key = join(signing, 'release.p12');
const passwordFile = join(signing, 'store-password');
const alias = 'zhuole-docs';
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--initialize-key') || args.length > 1)
  throw new Error('Only --initialize-key is supported');
const env = { ...process.env, PATH: join(java, 'bin') + ':' + process.env.PATH };
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 20_000_000,
    ...options,
  });
  if (result.status !== 0)
    throw new Error(`${command.split('/').at(-1)} failed; inspect local build output`);
  return result.stdout || '';
}
function requireOutsideWorkspace(path) {
  const rel = relative(root, path);
  if (!rel.startsWith('..' + '/') && rel !== '..')
    throw new Error('Release signing material must stay outside the workspace');
}
requireOutsideWorkspace(signing);
if (args.includes('--initialize-key')) {
  await mkdir(dirname(signing), { recursive: true, mode: 0o700 });
  requireOutsideWorkspace(await realpath(dirname(signing)));
  // Refuse existing directories, including partial setup; never replace a release identity.
  await mkdir(signing, { mode: 0o700 });
  const oldMask = process.umask(0o077);
  try {
    await writeFile(passwordFile, randomBytes(32).toString('hex') + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    run(
      join(java, 'bin/keytool'),
      [
        '-genkeypair',
        '-keystore',
        key,
        '-storetype',
        'PKCS12',
        '-alias',
        alias,
        '-keyalg',
        'RSA',
        '-keysize',
        '3072',
        '-validity',
        '10000',
        '-dname',
        'CN=Zhuole Docs',
        '-storepass:file',
        passwordFile,
        '-keypass:file',
        passwordFile,
      ],
      { stdio: 'inherit' },
    );
    await chmod(key, 0o600);
    console.log(
      'Created a dedicated Android release identity outside the repository. Back up its directory securely.',
    );
  } finally {
    process.umask(oldMask);
  }
  process.exit(0);
}
requireOutsideWorkspace(await realpath(signing));
for (const path of [key, passwordFile]) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error('Signing files must be regular files readable only by their owner');
}
const gradle = await readFile(join(root, 'android/app/build.gradle'), 'utf8');
const version = gradle.match(/versionName\s+"([\d.]+)"/)?.[1];
const build = gradle.match(/versionCode\s+(\d+)/)?.[1];
assert.ok(version && build, 'Native version is required');
const tools = join(sdk, 'build-tools', process.env.ANDROID_BUILD_TOOLS || '36.0.0');
const outputDirectory = resolve(
  process.env.ZHUOLE_ANDROID_OUTPUT_DIR || join(root, 'releases/mobile'),
);
const output = join(outputDirectory, `ZhuoleDocs-${version}-android-release.apk`);
await mkdir(dirname(output), { recursive: true });
try {
  await access(output);
  throw new Error('Release artifact exists; use a new version instead of replacing it');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
run('npm', ['run', 'build'], { stdio: 'inherit' });
run('npx', ['cap', 'sync', 'android'], { stdio: 'inherit' });
run(join(root, 'android/gradlew'), ['assembleRelease', '--no-daemon'], {
  cwd: join(root, 'android'),
  stdio: 'inherit',
});
const temp = await mkdtemp(join(root, 'releases/mobile/android-release-'));
const aligned = join(temp, 'aligned.apk');
const signed = join(temp, 'signed.apk');
run(join(tools, 'zipalign'), [
  '-P',
  '16',
  '-f',
  '4',
  join(root, 'android/app/build/outputs/apk/release/app-release-unsigned.apk'),
  aligned,
]);
run(join(tools, 'apksigner'), [
  'sign',
  '--ks',
  key,
  '--ks-key-alias',
  alias,
  '--ks-pass',
  'file:' + passwordFile,
  '--out',
  signed,
  aligned,
]);
const signature = run(join(tools, 'apksigner'), ['verify', '--verbose', '--print-certs', signed]);
assert.ok(!signature.includes('CN=Android Debug'), 'Debug certificate is forbidden');
const certificate = signature.match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/)?.[1];
assert.ok(certificate, 'Signer certificate fingerprint missing');
run(join(tools, 'zipalign'), ['-c', '-P', '16', '4', signed]);
const badging = run(join(tools, 'aapt'), ['dump', 'badging', signed]);
assert.ok(badging.includes("name='com.youdroid.zhuoledocs'"));
assert.ok(badging.includes(`versionCode='${build}' versionName='${version}'`));
assert.ok(!badging.includes('application-debuggable'), 'Release APK must not be debuggable');
const bytes = await readFile(signed);
const zip = await JSZip.loadAsync(bytes);
const manifest = await readFile(join(root, 'dist/index.html'));
assert.deepEqual(await zip.file('assets/public/index.html').async('nodebuffer'), manifest);
const { readdir } = await import('node:fs/promises');
let count = 0;
async function verifyAssets(path, prefix = '') {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) await verifyAssets(join(path, entry.name), name + '/');
    else {
      const asset = zip.file('assets/public/' + name);
      assert.ok(asset, `Missing packaged asset: ${name}`);
      assert.deepEqual(
        await asset.async('nodebuffer'),
        await readFile(join(path, entry.name)),
        name,
      );
      count++;
    }
  }
}
await verifyAssets(join(root, 'dist'));
await copyFile(signed, output, constants.COPYFILE_EXCL);
const evidence = {
  version,
  build,
  applicationId: 'com.youdroid.zhuoledocs',
  debuggable: false,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  signerSha256: certificate,
  matchedWebFiles: count,
  signature,
  badging,
  scope:
    'Release packaging, signature and asset verification; runtime and store acceptance are separate.',
};
await writeFile(
  join(outputDirectory, `${version}-android-release-verification.json`),
  JSON.stringify(evidence, null, 2) + '\n',
);
console.log(`Verified release APK: ${output}`);
console.log(`SHA-256: ${evidence.sha256}`);
