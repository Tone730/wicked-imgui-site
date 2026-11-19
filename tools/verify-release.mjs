// verify-release.mjs — one-command release integrity check.
//
//   node tools/verify-release.mjs [version] [--remote]
//
// Thin wrapper over tools/verify_release.py so the canonical command is
// memorable and does not require re-deriving the Python invocation. Checks
// feed/ZIP checksums and sizes, ZIP layout and licence notices, and confirms
// the ASAR header hash matches the embedded PE Integrity/ElectronAsar record.
// --remote additionally compares the GitHub release asset digest via gh.exe.
// Fully offline unless --remote is passed.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(root, 'tools', 'verify_release.py');

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const version = args.find((a) => a !== '--remote');

const pyArgs = [script];
if (version) pyArgs.push('--version', version);
if (remote) pyArgs.push('--remote');

const result = spawnSync('python', pyArgs, { cwd: root, stdio: 'inherit' });
if (result.error) {
  console.error('verify-release: could not start python:', result.error.message);
  process.exit(1);
}
process.exitCode = result.status ?? 1;
