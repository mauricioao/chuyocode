import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveOthersRoot } from './paths.mjs';

/**
 * Regression coverage for the worktree path bug (LANZAMIENTO.md §2): scripts
 * that compute `ChuyoCode_others` by walking up from their own `__dirname`
 * resolve it as a sibling of the WORKTREE instead of the main checkout when
 * run from `ChuyoCode-worktrees/<name>/`. `resolveOthersRoot` must resolve
 * the sibling of the MAIN checkout regardless of which worktree it runs
 * from — proven here against a REAL git worktree (`git init` + `git worktree
 * add`), not a mocked git call.
 */
describe('resolveOthersRoot', () => {
  const sandboxes: string[] = [];

  afterEach(() => {
    for (const dir of sandboxes.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function makeSandbox() {
    const root = mkdtempSync(join(tmpdir(), 'chuyo-paths-'));
    sandboxes.push(root);
    return root;
  }

  function git(cwd: string, args: string[]) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
  }

  /** Builds `<root>/main-repo` (a real git repo with one commit) and `<root>/ChuyoCode_others`. */
  function makeMainCheckout(root: string) {
    const mainRepo = join(root, 'main-repo');
    mkdirSync(mainRepo, { recursive: true });
    git(mainRepo, ['init', '--quiet']);
    git(mainRepo, ['config', 'user.email', 'test@example.com']);
    git(mainRepo, ['config', 'user.name', 'Test']);
    writeFileSync(join(mainRepo, 'README.md'), 'placeholder\n');
    git(mainRepo, ['add', 'README.md']);
    git(mainRepo, ['commit', '--quiet', '-m', 'init']);
    mkdirSync(join(root, 'ChuyoCode_others'), { recursive: true });
    return mainRepo;
  }

  it('resolves the sibling of the MAIN checkout when run from a worktree', () => {
    const root = makeSandbox();
    const mainRepo = makeMainCheckout(root);
    const worktreePath = join(root, 'worktrees', 'some-feature');
    git(mainRepo, ['worktree', 'add', worktreePath, '-b', 'some-feature']);

    const scriptDir = join(worktreePath, 'scripts', 'characters');
    mkdirSync(scriptDir, { recursive: true });

    const result = resolveOthersRoot({ scriptDir, env: {} });

    expect(result).toBe(join(root, 'ChuyoCode_others'));
    // Must NOT be the buggy sibling-of-the-worktree path.
    expect(result).not.toBe(join(dirname(worktreePath), 'ChuyoCode_others'));
  });

  it('resolves the sibling of the MAIN checkout when run from the main checkout itself', () => {
    const root = makeSandbox();
    const mainRepo = makeMainCheckout(root);
    const scriptDir = join(mainRepo, 'scripts', 'characters');
    mkdirSync(scriptDir, { recursive: true });

    const result = resolveOthersRoot({ scriptDir, env: {} });

    expect(result).toBe(join(root, 'ChuyoCode_others'));
  });

  it('honors the CHUYO_OTHERS_DIR override before touching git', () => {
    const result = resolveOthersRoot({
      scriptDir: '/does/not/matter',
      env: { CHUYO_OTHERS_DIR: '/explicit/override' },
    });

    expect(result).toBe('/explicit/override');
  });

  it('falls back to the script repo root sibling when git is unavailable', () => {
    const scriptDir = join('some', 'repo', 'scripts', 'characters');

    const result = resolveOthersRoot({
      scriptDir,
      env: {},
      runGit: () => {
        throw new Error('git not found');
      },
    });

    expect(result).toBe(join('some', 'ChuyoCode_others'));
  });
});
