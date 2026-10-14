import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Operational script has no declaration file.
import { parseOptions, androidDevices, iosDevices, selectDevice } from '../scripts/run-release.mjs';

test('release selection rejects invalid and incomplete options', () => {
  assert.deepEqual(
    parseOptions(['--platform', 'ios', '--mode', 'release', '--device', 'id', '--dry-run']),
    { platform: 'ios', mode: 'release', device: 'id', 'dry-run': true },
  );
  for (const args of [
    ['--mode'],
    ['--mode', 'store'],
    ['--platform', 'unknown'],
    ['--device', '--dry-run'],
    ['--delete'],
  ])
    assert.throws(() => parseOptions(args));
});
test('only authorized online Android targets can be selected', () => {
  const devices = androidDevices(
    'List of devices attached\na device product:x model:Phone\nb unauthorized\nc offline\nemulator-5580 device\n',
  );
  assert.deepEqual(
    devices.map((d: { id: string }) => d.id),
    ['a', 'emulator-5580'],
  );
  assert.equal(selectDevice(devices, 'a').id, 'a');
  assert.throws(() => selectDevice(devices, 'b'), /not available/);
});
test('iOS targets exclude offline phones and non-iOS devices and retain Xcode UDIDs', () => {
  const phone = {
    identifier: 'core-id',
    connectionProperties: { tunnelState: 'connected' },
    hardwareProperties: { platform: 'iOS', udid: 'xcode-id' },
    deviceProperties: { name: 'Phone' },
  };
  const devices = iosDevices(
    {
      result: {
        devices: [
          phone,
          { ...phone, identifier: 'offline', connectionProperties: { tunnelState: 'unavailable' } },
          { ...phone, hardwareProperties: { platform: 'watchOS' } },
        ],
      },
    },
    {
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-26-1': [
          { udid: 'sim', name: 'iPad', isAvailable: true, state: 'Shutdown' },
          { udid: 'missing', isAvailable: false },
        ],
        'com.apple.CoreSimulator.SimRuntime.watchOS-26-1': [{ udid: 'watch', isAvailable: true }],
      },
    },
  );
  assert.deepEqual(
    devices.map((d: { id: string }) => d.id),
    ['core-id', 'sim'],
  );
  assert.equal(devices[0].destination, 'xcode-id');
  assert.equal(devices[1].simulator, true);
});

test('zero-exit device failures cannot be reported as successful launches', async () => {
  // @ts-expect-error Operational script has no declaration file.
  const { validateDeviceOutput } = await import('../scripts/run-release.mjs');
  assert.throws(() =>
    validateDeviceOutput(
      'error: failed to start ability. Error Code:10106102',
      /start ability successfully/i,
    ),
  );
  assert.throws(() =>
    validateDeviceOutput(
      'Starting: Intent\nError: Activity class does not exist.',
      /Starting: Intent/,
    ),
  );
  assert.throws(() => validateDeviceOutput('AppMod finish', /install bundle successfully/i));
  validateDeviceOutput('start ability successfully.', /start ability successfully/i);
  validateDeviceOutput(
    'msg:install bundle successfully. AppMod finish',
    /install bundle successfully/i,
  );
});
