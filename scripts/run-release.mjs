import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = 'com.youdroid.zhuoledocs';

export function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (['--help', '--dry-run'].includes(key)) options[key.slice(2)] = true;
    else if (
      ['--platform', '--device', '--mode'].includes(key) &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    )
      options[key.slice(2)] = args[++i];
    else throw new Error(`Unknown or incomplete option: ${key}`);
  }
  if (options.platform && !['android', 'ios', 'harmony'].includes(options.platform))
    throw new Error('Invalid platform');
  if (options.mode && !['debug', 'release'].includes(options.mode)) throw new Error('Invalid mode');
  return options;
}
export function androidDevices(output) {
  return output.split('\n').flatMap((line) => {
    const match = line.match(/^(\S+)\s+device(?:\s+(.*))?$/);
    return match ? [{ id: match[1], label: `${match[1]} ${match[2] || ''}` }] : [];
  });
}
export function iosDevices(physical, simulated) {
  return [
    ...(physical.result?.devices || [])
      .filter(
        (d) =>
          d.connectionProperties?.tunnelState !== 'unavailable' &&
          (d.connectionProperties?.tunnelState === 'connected' ||
            d.connectionProperties?.pairingState === 'paired') &&
          d.hardwareProperties?.platform === 'iOS',
      )
      .map((d) => ({
        id: d.identifier,
        destination: d.hardwareProperties.udid,
        label: `${d.deviceProperties?.name || d.identifier} (device)`,
        simulator: false,
      })),
    ...Object.entries(simulated.devices || {})
      .filter(([runtime]) => runtime.includes('.iOS-'))
      .flatMap(([, devices]) => devices)
      .filter((d) => d.isAvailable)
      .map((d) => ({
        id: d.udid,
        label: `${d.name} (${d.state}, simulator)`,
        simulator: true,
        state: d.state,
      })),
  ];
}
export function selectDevice(devices, id) {
  const device = devices.find((d) => d.id === id);
  if (!device) throw new Error('Selected device is not available; reconnect and retry');
  return device;
}
function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 20_000_000,
    stdio: 'inherit',
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed (${result.status ?? result.error?.code})`);
  return result.stdout || '';
}
function capture(command, args) {
  return run(command, args, { stdio: ['ignore', 'pipe', 'inherit'] });
}
export function validateDeviceOutput(output, success) {
  if (/\b(?:error|failed|failure)\b/i.test(output) || (success && !success.test(output)))
    throw new Error(
      'Device operation failed; see the device output above. Existing app data is preserved.',
    );
}
function deviceCommand(command, args, success) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 120_000 });
  const output = (result.stdout || '') + (result.stderr || '');
  console.log(output.trim());
  if (result.error || result.status !== 0)
    throw new Error('Device command did not complete successfully');
  validateDeviceOutput(output, success);
}
async function choose(title, items, rl) {
  if (!items.length) throw new Error(`No available ${title.toLowerCase()}`);
  console.log(`\n${title}`);
  items.forEach((item, i) => console.log(`  ${i + 1}. ${item.label}`));
  for (;;) {
    const input = await rl.question('Select number (q to quit): ');
    if (input.trim().toLowerCase() === 'q') throw new Error('Canceled');
    const index = Number(input) - 1;
    if (Number.isInteger(index) && items[index]) return items[index];
    console.log('Enter a number from the list.');
  }
}
function requireFile(path, name) {
  if (!existsSync(path)) throw new Error(`${name} not found: ${path}`);
  return path;
}
export function requireJava21(output) {
  if (!/version\s+"21(?:[."])/.test(output))
    throw new Error('Android builds require JDK 21; set JAVA_HOME to a JDK 21 installation');
}
function configureAndroid() {
  process.env.ANDROID_HOME ||= join(homedir(), 'Library/Android/sdk');
  if (!process.env.JAVA_HOME) {
    const probe = spawnSync('/usr/libexec/java_home', ['-F', '-v', '21'], { encoding: 'utf8' });
    if (probe.status === 0) process.env.JAVA_HOME = probe.stdout.trim();
    else {
      const local = join(root, 'releases/mobile/toolchains');
      const jdk = existsSync(local)
        ? readdirSync(local).find((name) => name.startsWith('jdk-21.'))
        : undefined;
      if (jdk) process.env.JAVA_HOME = join(local, jdk, 'Contents/Home');
    }
  }
  return process.env.ADB || join(process.env.ANDROID_HOME, 'platform-tools/adb');
}
function harmonyTools() {
  const base = join(homedir(), 'Library/Huawei/CommandLineTools');
  const versions = existsSync(base)
    ? readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    : [];
  const home = process.env.HARMONY_HOME || join(base, versions[0] || 'not-installed');
  return {
    hvigor: process.env.HVIGORW || join(home, 'bin/hvigorw'),
    hdc: process.env.HDC || join(home, 'sdk/default/openharmony/toolchains/hdc'),
  };
}
async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(
      'Usage: ./run_release.sh [--platform android|ios|harmony] [--device ID] [--mode debug|release] [--dry-run]\nMissing choices are interactive. Release means optimized local installation, not store distribution.\n--dry-run lists/selects real devices but does not build, boot, install or launch.',
    );
    return;
  }
  if (!process.stdin.isTTY && !(options.platform && options.device && options.mode))
    throw new Error('Interactive terminal required, or supply --platform, --device and --mode');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const platform =
      options.platform ||
      (
        await choose(
          'Platform',
          ['android', 'ios', 'harmony'].map((id) => ({ id, label: id })),
          rl,
        )
      ).id;
    const mode =
      options.mode ||
      (
        await choose(
          'Build mode',
          ['debug', 'release'].map((id) => ({ id, label: id })),
          rl,
        )
      ).id;
    let devices, adb, harmony;
    if (platform === 'android') {
      adb = configureAndroid();
      devices = androidDevices(capture(adb, ['devices', '-l']));
    } else if (platform === 'harmony') {
      harmony = harmonyTools();
      devices = capture(harmony.hdc, ['list', 'targets'])
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('['))
        .map((id) => ({ id, label: id }));
    } else {
      const temp = join(root, 'releases/run-release');
      mkdirSync(temp, { recursive: true });
      const listing = join(mkdtempSync(join(temp, 'devices-')), 'devices.json');
      capture('xcrun', ['devicectl', 'list', 'devices', '--json-output', listing]);
      devices = iosDevices(
        JSON.parse(readFileSync(listing)),
        JSON.parse(capture('xcrun', ['simctl', 'list', 'devices', 'available', '--json'])),
      );
    }
    const device = options.device
      ? selectDevice(devices, options.device)
      : await choose('Device', devices, rl);
    console.log(`\nSelected: ${platform} / ${mode} / ${device.label}`);
    if (options['dry-run']) {
      console.log('Dry run complete; no build or installation performed.');
      return;
    }
    const base = join(root, 'releases/run-release');
    mkdirSync(base, { recursive: true });
    const output = mkdtempSync(join(base, `${platform}-${mode}-`));
    console.log(`Build output: ${output}`);
    if (platform === 'android') {
      if (!process.env.JAVA_HOME) throw new Error('Set JAVA_HOME to JDK 21');
      const java = spawnSync(join(process.env.JAVA_HOME, 'bin/java'), ['-version'], {
        encoding: 'utf8',
      });
      if (java.error || java.status !== 0)
        throw new Error('JAVA_HOME does not contain a working Java runtime');
      requireJava21((java.stdout || '') + (java.stderr || ''));
      if (mode === 'release') {
        run(process.execPath, ['scripts/build-android-release.mjs'], {
          env: { ...process.env, ZHUOLE_ANDROID_OUTPUT_DIR: output },
        });
        const apk = readdirSync(output).find((name) => name.endsWith('.apk'));
        if (!apk) throw new Error('Verified APK missing');
        run(adb, ['-s', device.id, 'install', '-r', join(output, apk)]);
      } else {
        run('npm', ['run', 'build']);
        run('npx', ['cap', 'sync', 'android']);
        run(join(root, 'android/gradlew'), ['assembleDebug', '--no-daemon'], {
          cwd: join(root, 'android'),
        });
        run(adb, [
          '-s',
          device.id,
          'install',
          '-r',
          join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'),
        ]);
      }
      deviceCommand(
        adb,
        ['-s', device.id, 'shell', 'am', 'start', '-n', `${bundle}/.MainActivity`],
        /Starting: Intent/,
      );
    } else if (platform === 'ios') {
      run('npm', ['run', 'build']);
      run('npx', ['cap', 'sync', 'ios']);
      const configuration = mode === 'debug' ? 'Debug' : 'Release';
      const sdk = device.simulator ? 'iphonesimulator' : 'iphoneos';
      run('xcodebuild', [
        '-workspace',
        'ios/App/App.xcworkspace',
        '-scheme',
        'App',
        '-configuration',
        configuration,
        '-sdk',
        sdk,
        '-destination',
        `id=${device.destination || device.id}`,
        '-derivedDataPath',
        output,
        ...(device.simulator
          ? ['CODE_SIGNING_ALLOWED=NO']
          : [
              '-allowProvisioningUpdates',
              '-allowProvisioningDeviceRegistration',
              `DEVELOPMENT_TEAM=${process.env.APPLE_TEAM_ID || 'Y4MB2B6UD3'}`,
            ]),
        'build',
      ]);
      const app = join(output, `Build/Products/${configuration}-${sdk}/App.app`);
      if (device.simulator) {
        if (device.state !== 'Booted') run('xcrun', ['simctl', 'boot', device.id]);
        run('xcrun', ['simctl', 'bootstatus', device.id, '-b']);
        run('xcrun', ['simctl', 'install', device.id, app]);
        run('xcrun', ['simctl', 'launch', device.id, bundle]);
      } else {
        run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', device.id, app]);
        run('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', device.id, bundle]);
      }
    } else {
      const reference = requireFile(
        process.env.HARMONY_SIGNING_REFERENCE ||
          resolve(root, '../Jimu/harmony/build-profile.json5'),
        'HARMONY_SIGNING_REFERENCE',
      );
      const profile = requireFile(
        process.env.HARMONY_DEBUG_PROFILE || join(homedir(), 'zhuoledocs_debugDebug.p7b'),
        'HARMONY_DEBUG_PROFILE',
      );
      requireFile(harmony.hvigor, 'HVIGORW');
      const hap = join(output, 'ZhuoleDocs.hap');
      run('npm', ['run', 'harmony:sync']);
      run(process.execPath, [
        'scripts/build-harmony-debug.mjs',
        reference,
        profile,
        harmony.hvigor,
        mode,
        hap,
      ]);
      deviceCommand(
        harmony.hdc,
        ['-t', device.id, 'install', '-r', hap],
        /install bundle successfully/i,
      );
      deviceCommand(
        harmony.hdc,
        ['-t', device.id, 'shell', 'aa', 'start', '-a', 'EntryAbility', '-b', bundle],
        /start ability successfully/i,
      );
    }
    console.log('Build, installation and launch completed. UI acceptance is separate.');
  } finally {
    rl.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
