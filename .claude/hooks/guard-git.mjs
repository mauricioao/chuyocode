// PreToolUse(Bash) guard for the parallel-session workflow.
// Denies two commands that have broken shared state before:
//   1. switching branches in the main checkout (other sessions own it;
//      every branch gets its own worktree under ChuyoCode-worktrees/)
//   2. force-adding the gitignored, local-only BACKLOG.md or CLAUDE.md
import { execFileSync } from 'node:child_process';
import path from 'node:path';

let input = {};
try {
  input = JSON.parse(await readStdin());
} catch {
  process.exit(0); // never block on a malformed payload
}
const command = String(input.tool_input?.command ?? '');
const cwd = input.cwd || process.cwd();

const reason = forceAddReason(command) ?? branchSwitchReason(command, cwd);
if (reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
}

function forceAddReason(cmd) {
  const forceAdd = /\bgit\b[^;&|]*\badd\b[^;&|]*(\s-f\b|--force\b)/.test(cmd);
  if (forceAdd && /\b(BACKLOG|CLAUDE)\.md\b/.test(cmd)) {
    return 'BACKLOG.md and CLAUDE.md are local-only on purpose and must never be committed.';
  }
  return null;
}

function branchSwitchReason(cmd, baseDir) {
  for (const segment of cmd.split(/&&|\|\||;/)) {
    const match = segment.match(/\bgit\s+(?:-C\s+("[^"]+"|'[^']+'|\S+)\s+)?(checkout|switch)\b(.*)/);
    if (!match) continue;
    const [, dashC, verb, rest] = match;
    // `git checkout [<ref>] -- <paths>` restores files; it does not move HEAD.
    if (verb === 'checkout' && /(^|\s)--(\s|$)/.test(rest)) continue;
    const dir = resolveDir(cmd, segment, dashC, baseDir);
    if (isMainCheckout(dir)) {
      return (
        'Do not switch branches in the main checkout: another session may own it. ' +
        'Create a worktree instead: git worktree add ../ChuyoCode-worktrees/<name> -b <branch> main'
      );
    }
  }
  return null;
}

function resolveDir(cmd, segment, dashC, baseDir) {
  if (dashC) return path.resolve(baseDir, unquote(dashC));
  // A leading `cd <dir> && git switch ...` moves the command elsewhere.
  const before = cmd.slice(0, cmd.indexOf(segment));
  const cds = [...before.matchAll(/\bcd\s+("[^"]+"|'[^']+'|\S+)/g)];
  return cds.length ? path.resolve(baseDir, unquote(cds.at(-1)[1])) : baseDir;
}

function isMainCheckout(dir) {
  try {
    const [gitDir, commonDir] = execFileSync('git', ['-C', dir, 'rev-parse', '--git-dir', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split(/\r?\n/)
      .map((p) => path.resolve(dir, p));
    // In a linked worktree --git-dir points inside .git/worktrees/<name>.
    return gitDir === commonDir;
  } catch {
    return false;
  }
}

function unquote(s) {
  // Git Bash spells E:\x as /e/x; path.resolve on Windows would misread it.
  return s.replace(/^["']|["']$/g, '').replace(/^\/([a-zA-Z])(\/|$)/, '$1:/');
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data || '{}';
}
