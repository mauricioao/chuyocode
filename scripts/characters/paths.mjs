/**
 * Resolves the `ChuyoCode_others` sibling directory — the not-committed
 * directory that holds character source photos/masters (and other owner
 * assets) — from the MAIN checkout, never from whichever git worktree a
 * script happens to run in.
 *
 * `process.mjs` and `export-web.mjs` used to compute this by walking up from
 * their own `__dirname` (`join(__dirname, '..', '..', '..', 'ChuyoCode_others', ...)`).
 * That is correct when the script runs from the main checkout
 * (`…/ChuyoCode/scripts/characters/*.mjs` → sibling `…/ChuyoCode_others`),
 * but wrong from a worktree (`…/ChuyoCode-worktrees/<name>/scripts/characters/*.mjs`
 * → walks up into a nonexistent `…/ChuyoCode-worktrees/ChuyoCode_others`).
 *
 * Every git worktree (and the main checkout itself) shares one *common
 * dir* — the real `.git` directory, which normally lives inside the main
 * checkout. `git rev-parse --git-common-dir` resolves it from ANY worktree,
 * so its parent is reliably the main checkout's root regardless of which
 * worktree this script runs from.
 *
 * Resolution order:
 *   1. `CHUYO_OTHERS_DIR` env var, if set — explicit override, used as-is
 *      (lets a script be pointed at any location, e.g. for testing).
 *   2. The MAIN checkout's root, found via git's common dir, sibling
 *      `ChuyoCode_others`.
 *   3. Fallback when git is unavailable (not a git repo, or `git` isn't on
 *      PATH): assume this script's own repo root IS the main checkout
 *      (`scriptDir/../..`), sibling `ChuyoCode_others` — the pre-fix
 *      behaviour, still correct when actually run from the main checkout.
 *
 * `scriptDir` is always the calling script's own `__dirname`
 * (`scripts/characters/`) — this module never reads `import.meta.url`
 * itself so the resolution stays injectable/testable.
 */
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * @param {object} [opts]
 * @param {string} opts.scriptDir - the calling script's own `__dirname`.
 * @param {NodeJS.ProcessEnv} [opts.env] - defaults to `process.env`.
 * @param {(args: string[]) => string} [opts.runGit] - injectable for tests;
 *   defaults to a real `git` invocation with `cwd: scriptDir`.
 * @returns {string} absolute path to the resolved `ChuyoCode_others` directory.
 */
export function resolveOthersRoot({ scriptDir, env = process.env, runGit } = {}) {
  if (!scriptDir) throw new Error('resolveOthersRoot: scriptDir is required');

  if (env.CHUYO_OTHERS_DIR) return env.CHUYO_OTHERS_DIR;

  const git = runGit ?? ((args) => execFileSync('git', args, { cwd: scriptDir, encoding: 'utf8' }));

  try {
    const gitCommonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
    const mainCheckoutRoot = dirname(gitCommonDir);
    return join(dirname(mainCheckoutRoot), 'ChuyoCode_others');
  } catch {
    // Not a git repo, or `git` isn't on PATH — assume we ARE the main
    // checkout (two levels up from scripts/characters/ is the repo root).
    const scriptRepoRoot = join(scriptDir, '..', '..');
    return join(dirname(scriptRepoRoot), 'ChuyoCode_others');
  }
}
