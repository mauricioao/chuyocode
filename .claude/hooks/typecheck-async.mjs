// PostToolUse(Write|Edit) hook, registered async + asyncRewake.
// `pnpm typecheck` (astro check) takes about two minutes, too slow to block
// every edit. This runs it in the background for the worktree that owns the
// edited file and only wakes Claude (exit 2) when it fails. A burst of edits
// shares one run: later edits mark the run dirty and it repeats once.
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NODE22_DIR = process.env.CHUYO_NODE_DIR ?? 'C:\\Users\\mauri\\AppData\\Roaming\\nvm\\v22.23.1';
const STALE_LOCK_MS = 10 * 60 * 1000;

const input = JSON.parse(await readStdin());
const file = input.tool_input?.file_path ?? input.tool_response?.filePath;
if (!file || !/\.(ts|tsx|astro)$/.test(file)) process.exit(0);

const root = repoRoot(path.dirname(file));
if (!root || !fs.existsSync(path.join(root, 'astro.config.mjs'))) process.exit(0);

const key = createHash('sha1').update(root).digest('hex').slice(0, 12);
const lock = path.join(os.tmpdir(), `chuyo-typecheck-${key}.lock`);
const dirty = `${lock}.dirty`;

if (fs.existsSync(lock) && Date.now() - fs.statSync(lock).mtimeMs < STALE_LOCK_MS) {
  fs.writeFileSync(dirty, '');
  process.exit(0);
}
fs.writeFileSync(lock, String(process.pid));

let result;
try {
  do {
    fs.rmSync(dirty, { force: true });
    result = typecheck(root);
  } while (fs.existsSync(dirty));
} finally {
  fs.rmSync(lock, { force: true });
}

if (result.status !== 0) {
  const lines = `${result.stdout}\n${result.stderr}`.split(/\r?\n/).filter(Boolean);
  const errors = lines.filter((line) => /error/i.test(line)).slice(0, 30);
  const detail = (errors.length ? errors : lines.slice(-10)).join('\n');
  process.stderr.write(`pnpm typecheck failed in ${root}:\n${detail}\n`);
  process.exit(2);
}

function typecheck(cwd) {
  const PATH = fs.existsSync(NODE22_DIR) ? `${NODE22_DIR}${path.delimiter}${process.env.PATH}` : process.env.PATH;
  return spawnSync('pnpm', ['typecheck'], { cwd, env: { ...process.env, PATH }, encoding: 'utf8', shell: true });
}

function repoRoot(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data || '{}';
}
