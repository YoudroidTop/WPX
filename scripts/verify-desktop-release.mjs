import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, openSync, closeSync } from 'node:fs';
import { readFile, readdir, stat, writeFile, mkdtemp, rm, rmdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extractFile, listPackage, statFile } from '@electron/asar';

const output = 'releases/desktop';
if (!process.env.SEVEN_ZIP) throw new Error('Set SEVEN_ZIP to a trusted local 7zz executable');
const metadata = JSON.parse(await readFile('desktop-dist/package.json', 'utf8'));
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
assert.equal(metadata.version, version, 'Staged version differs from project');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else if (entry.isFile()) found.push(path);
    else throw new Error(`Unexpected staged file type: ${path}`);
  }
  return found;
}
const staged = new Map();
for (const path of await files('desktop-dist')) {
  const name = relative('desktop-dist', path);
  assert.ok(
    name === 'package.json' || /^(app|web)\//.test(name),
    `Unexpected staged content: ${name}`,
  );
  staged.set(name, await readFile(path));
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fileDigest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
const targets = [
  { os: 'mac', arch: 'arm64', folder: 'mac-arm64', nativeArch: 'arm64' },
  { os: 'mac', arch: 'x64', folder: 'mac', nativeArch: 'x86_64' },
  { os: 'win', arch: 'x64', folder: 'win-unpacked', machine: 0x8664 },
  { os: 'win', arch: 'arm64', folder: 'win-arm64-unpacked', machine: 0xaa64 },
];
function macSignature(app) {
  const result = spawnSync('codesign', ['-dv', '--verbose=4', app], { encoding: 'utf8' });
  assert.equal(result.status, 0, 'Cannot inspect macOS signature');
  return {
    authorities: [...result.stderr.matchAll(/^Authority=(.+)$/gm)].map((match) => match[1]),
    teamIdentifier: result.stderr.match(/^TeamIdentifier=(.+)$/m)?.[1] ?? null,
    hardenedRuntime: /flags=.*\(.*runtime.*\)/.test(result.stderr),
    integrityVerified: true,
    notarization: 'not verified',
  };
}
const packages = [];
for (const target of targets) {
  const root = join(output, target.folder);
  const archive =
    target.os === 'mac'
      ? join(root, '卓乐文档.app/Contents/Resources/app.asar')
      : join(root, 'resources/app.asar');
  const packaged = listPackage(archive)
    .map((name) => name.replace(/^\//, ''))
    .filter((name) => !statFile(archive, name).files)
    .sort();
  assert.deepEqual(
    packaged,
    [...staged.keys()].sort(),
    `${target.folder}: unexpected/missing packaged files`,
  );
  for (const name of packaged)
    assert.equal(
      digest(extractFile(archive, name)),
      digest(staged.get(name)),
      `${target.folder}: stale payload ${name}`,
    );
  if (target.os === 'mac') {
    const executable = join(root, '卓乐文档.app/Contents/MacOS/卓乐文档');
    assert.equal(
      execFileSync('lipo', ['-archs', executable], { encoding: 'utf8' }).trim(),
      target.nativeArch,
    );
    execFileSync('codesign', ['--verify', '--deep', '--strict', join(root, '卓乐文档.app')], {
      stdio: 'pipe',
    });
  } else {
    const executable = await readFile(join(root, '卓乐文档.exe'));
    assert.equal(executable.toString('ascii', 0, 2), 'MZ');
    const offset = executable.readUInt32LE(0x3c);
    assert.equal(executable.readUInt32LE(offset), 0x4550);
    assert.equal(
      executable.readUInt16LE(offset + 4),
      target.machine,
      'Wrong Windows CPU architecture',
    );
  }
  const artifacts = [];
  for (const extension of target.os === 'mac' ? ['dmg', 'zip'] : ['exe']) {
    const name = `ZhuoleDocs-${version}-${target.os}-${target.arch}.${extension}`;
    const path = join(output, name);
    const info = await stat(path);
    assert.ok(info.isFile() && info.size > 1000000, `Invalid installer: ${name}`);
    let payloadCompared = false;
    let containerSignatureVerified = null;
    if (extension === 'dmg') {
      containerSignatureVerified =
        spawnSync('codesign', ['--verify', '--strict', path]).status === 0;
      const mount = await mkdtemp(join(tmpdir(), 'zhuole-dmg-verify-'));
      let attached = false;
      try {
        execFileSync('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, path], {
          stdio: 'pipe',
        });
        attached = true;
        const app = join(mount, '卓乐文档.app');
        execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' });
        assert.equal(
          await fileDigest(join(app, 'Contents/Resources/app.asar')),
          await fileDigest(archive),
          `${name}: DMG payload mismatch`,
        );
        assert.equal(
          await fileDigest(join(app, 'Contents/MacOS/卓乐文档')),
          await fileDigest(join(root, '卓乐文档.app/Contents/MacOS/卓乐文档')),
          `${name}: DMG executable mismatch`,
        );
        assert.deepEqual(macSignature(app), macSignature(join(root, '卓乐文档.app')));
        payloadCompared = true;
      } finally {
        if (attached) execFileSync('hdiutil', ['detach', mount], { stdio: 'pipe' });
        // Never recurse into a mount after a failed detach.
        await rmdir(mount);
      }
    }
    if (extension === 'zip') {
      const payload = execFileSync(
        'unzip',
        ['-p', path, '卓乐文档.app/Contents/Resources/app.asar'],
        { maxBuffer: 32000000 },
      );
      assert.equal(digest(payload), await fileDigest(archive), `${name}: archive payload mismatch`);
      payloadCompared = true;
    }
    if (extension === 'exe') {
      const temporary = await mkdtemp(join(tmpdir(), 'zhuole-installer-verify-'));
      try {
        const compressed = join(temporary, 'app.7z');
        const fd = openSync(compressed, 'wx');
        try {
          const embedded =
            target.arch === 'x64' ? '$PLUGINSDIR/app-64.7z' : '$PLUGINSDIR/app-arm64.7z';
          execFileSync(process.env.SEVEN_ZIP, ['x', '-so', path, embedded], {
            stdio: ['ignore', fd, 'pipe'],
          });
        } finally {
          closeSync(fd);
        }
        const payload = execFileSync(
          process.env.SEVEN_ZIP,
          ['x', '-so', compressed, 'resources/app.asar'],
          { maxBuffer: 32000000 },
        );
        assert.equal(
          digest(payload),
          await fileDigest(archive),
          `${name}: installer payload mismatch`,
        );
        const executable = execFileSync(
          process.env.SEVEN_ZIP,
          ['x', '-so', compressed, '卓乐文档.exe'],
          { maxBuffer: 250000000 },
        );
        assert.equal(
          digest(executable),
          await fileDigest(join(root, '卓乐文档.exe')),
          `${name}: executable mismatch`,
        );
        payloadCompared = true;
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
    artifacts.push({
      name,
      bytes: info.size,
      sha256: await fileDigest(path),
      payloadCompared,
      containerSignatureVerified,
    });
  }
  packages.push({
    os: target.os,
    architecture: target.arch,
    unpackedPayload: {
      sha256: await fileDigest(archive),
      filesVerified: packaged.length,
      matchesCurrentBuild: true,
    },
    signature:
      target.os === 'mac'
        ? macSignature(join(root, '卓乐文档.app'))
        : 'code signing deferred by user; not verified',
    installerRuntime: 'not verified by this script',
    artifacts,
  });
}
const manifest = {
  product: '卓乐文档',
  version,
  generatedAt: new Date().toISOString(),
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  worktreeDirty: Boolean(
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  ),
  publicReleaseReady: false,
  packages,
};
await writeFile(join(output, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  join(output, 'SHA256SUMS'),
  packages
    .flatMap((target) => target.artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`))
    .join('\n') + '\n',
);
console.log(
  `Verified ${packages.length} unpacked CPU targets against ${staged.size} staged files; hashed six release artifacts.`,
);
console.log(
  'Manifest does not establish installer execution, notarization or trusted public distribution.',
);
