import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const configPath = process.argv[2];
const architecture = process.argv[3];
assert.ok(
  !architecture || ['arm64', 'x64', '--status'].includes(architecture),
  'Expected arm64, x64 or --status',
);
assert.ok(configPath, 'Usage: node scripts/notarize-mac.mjs /path/to/asc.env');
const config = Object.fromEntries(
  (await readFile(configPath, 'utf8'))
    .split('\n')
    .filter((line) => line.trim() && !line.trimStart().startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=');
      return [
        line.slice(0, separator).trim(),
        line
          .slice(separator + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ''),
      ];
    }),
);
const key = config.ASC_API_KEY_PATH;
const keyId = config.ASC_KEY_ID || config.ASC_API_KEY_ID;
const issuer = config.ASC_ISSUER_ID;
assert.ok(
  key?.endsWith('.p8') && keyId && issuer,
  'Expected ASC_API_KEY_PATH (.p8), ASC_KEY_ID and ASC_ISSUER_ID',
);
const auth = ['--key', key, '--key-id', keyId, '--issuer', issuer];
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const recordsPath = 'releases/desktop/notarization.json';
let records = [];
try {
  records = JSON.parse(await readFile(recordsPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const run = (args) => {
  const result = spawnSync('xcrun', ['notarytool', ...args, ...auth, '--output-format', 'json'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || 'notarytool failed');
  return JSON.parse(result.stdout);
};
if (architecture === '--status') {
  for (const record of records) {
    record.status = run(['info', record.id]).status;
    await writeFile(recordsPath, JSON.stringify(records, null, 2) + '\n');
    console.log(`${record.id}: ${record.status}`);
  }
  process.exit(records.some((record) => record.status === 'Invalid') ? 1 : 0);
}

// Save each submission immediately; reruns poll existing jobs instead of uploading duplicates.
const { createHash } = await import('node:crypto');
for (const arch of architecture ? [architecture] : ['arm64', 'x64']) {
  for (const extension of ['zip', 'dmg']) {
    const artifact = resolve(`releases/desktop/ZhuoleDocs-${version}-mac-${arch}.${extension}`);
    const sha256 = createHash('sha256')
      .update(await readFile(artifact))
      .digest('hex');
    let record = records.find((entry) => entry.artifact === artifact && entry.sha256 === sha256);
    if (!record) {
      const job = run(['submit', artifact]);
      assert.ok(job.id, 'Submission did not return an ID');
      record = { artifact, sha256, id: job.id, status: 'Submitted' };
      records.push(record);
      await writeFile(recordsPath, JSON.stringify(records, null, 2) + '\n');
    }
    const job = run(['info', record.id]);
    record.status = job.status;
    await writeFile(recordsPath, JSON.stringify(records, null, 2) + '\n');
    console.log(`${arch} ${extension}: ${record.status} (${record.id})`);
    assert.notEqual(record.status, 'Invalid', 'Notarization rejected; inspect the job log');
  }
}
