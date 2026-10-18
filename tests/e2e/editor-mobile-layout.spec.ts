import { test, expect, type Page } from '@playwright/test';

/**
 * Editor mobile layout — night pass 2026-10-18 (recorrido H13–H16).
 *
 * Fixture: a "Varios juegos" (Básico) activity owned by the `e2e-regular`
 * fixture user, seeded directly in the local Supabase database (see the PR
 * draft for the exact SQL) — `block-1` is the Básico quiz block these tests
 * mostly exercise, `block-2` a "match"-template quiz block (used only to
 * reach `TemplateEditorKit`'s own live-preview stage for the canvas-height
 * check) and `block-3` a worksheet block with an image (used only to reach
 * the mobile toolbar's "Cambiar imagen" scroll region). Needs the local
 * Supabase fixture + this activity row; skips gracefully (same posture as
 * `desk-widgets-part4.spec.ts`) if the signed-in session does not actually
 * reach the editor (anonymous session, or the fixture activity missing).
 */

const ACTIVITY_ID = '99999999-0000-0000-0000-000000000001';

// Night run on a loaded machine: the dev server's first compile of this
// dynamic route can take well past Playwright's default 30s test timeout
// (see this worktree's own CLAUDE.md note on cold starts) — `commit` instead
// of the default `load` stops waiting once Astro has actually responded
// with the page, and a generous explicit `waitFor` on a real page marker
// (never just the URL, which a 404/error response at the same path would
// still match) tells a genuinely unreachable editor apart from a slow one.
// `?ventana=1` (`embeddedWindow.ts`'s own header): a plain top-level visit
// to this route is "host mode" — the HUB plus a window manager that opens
// the real editor in an `<iframe>`, which `page.getByTestId` cannot reach
// without a `frameLocator`. The SAME marker the window manager's own
// `iframe.src` uses renders the window's content directly, no hub, no
// iframe — the real `ActivityEditorIsland` this spec needs to measure.
async function gotoEditorOrSkip(page: Page): Promise<boolean> {
  await page.goto(`/es/crear/${ACTIVITY_ID}?ventana=1`, { waitUntil: 'commit', timeout: 120_000 });
  if (new URL(page.url()).pathname !== `/es/crear/${ACTIVITY_ID}`) return false;
  try {
    await page.getByTestId('block-list').waitFor({ state: 'visible', timeout: 120_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Legacy multi-block nav (`BlockList.tsx`'s own `sheet-nav-next`/
 * `sheet-position`) only works once the island has actually HYDRATED — the
 * button already exists (and is enabled) in the server-rendered HTML, so a
 * click that lands before React attaches its listener is silently swallowed.
 * Polling the click against the position label (rather than a fixed sleep)
 * self-corrects for however long hydration actually takes on a loaded
 * machine, instead of guessing a delay.
 */
async function goToSheet(page: Page, targetOneBased: number): Promise<void> {
  const position = page.getByTestId('sheet-position');
  await expect.poll(
    async () => {
      const text = await position.textContent();
      if (text?.trim().startsWith(`${targetOneBased} `) || text?.includes(` ${targetOneBased} `)) return true;
      await page.getByTestId('sheet-nav-next').click();
      return false;
    },
    { timeout: 100_000, intervals: [300, 500, 1000, 2000] },
  ).toBe(true);
}

test.describe('editor mobile layout (recorrido 2026-10-17/18, H13-H16)', () => {
  test.describe.configure({ timeout: 300_000 });

  test('H14: the question field top lines up with the answer field top (Básico row, sm+)', async ({ page }) => {
    // Side-by-side columns only apply from `sm` (640px) up — below that the
    // row now intentionally STACKS (question above answer), so comparing
    // top offsets only makes sense at 768/1280, not 375 (covered by the
    // "stacks full-width" test below instead).
    for (const viewport of [{ width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      const reached = await gotoEditorOrSkip(page);
      test.skip(!reached, 'Editor is sign-in gated; no fixture activity reachable in this run');

      const question = page.getByTestId('varios-question-slot-2');
      const answer = page.getByTestId('varios-answer-slot-2');
      await expect(question).toBeVisible();
      await expect(answer).toBeVisible();

      const qBox = await question.boundingBox();
      const aBox = await answer.boundingBox();
      expect(qBox).not.toBeNull();
      expect(aBox).not.toBeNull();
      if (!qBox || !aBox) continue;

      // Before the fix this was off by 36px (1280) — the drag handle sat as
      // its own line above the question field, with nothing pushing the
      // answer field down the same way.
      expect(Math.abs(qBox.y - aBox.y)).toBeLessThanOrEqual(6);
    }
  });

  test('H14: the "x" delete button never overlaps the answer field (1280px, side-by-side)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const reached = await gotoEditorOrSkip(page);
    test.skip(!reached, 'Editor is sign-in gated; no fixture activity reachable in this run');

    const answer = page.getByTestId('varios-answer-slot-2');
    const remove = page.getByTestId('varios-remove-slot-2');
    await expect(answer).toBeVisible();
    await expect(remove).toBeVisible();

    const aBox = await answer.boundingBox();
    const rBox = await remove.boundingBox();
    expect(aBox).not.toBeNull();
    expect(rBox).not.toBeNull();
    if (!aBox || !rBox) return;

    // The old 36px (2.25rem) track was narrower than the "x" button's own
    // 40px coarse-pointer touch target, so it rendered ~10px into the
    // answer field. No horizontal overlap now (small tolerance for AA).
    expect(rBox.x).toBeGreaterThanOrEqual(aBox.x + aBox.width - 1);
  });

  test('H14: the question field is not cramped at 375px (stacks full-width instead of a ~129px column)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const reached = await gotoEditorOrSkip(page);
    test.skip(!reached, 'Editor is sign-in gated; no fixture activity reachable in this run');

    const question = page.getByTestId('varios-question-slot-1');
    await expect(question).toBeVisible();
    const box = await question.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    expect(box.width).toBeGreaterThan(250);
  });

  test('H15: the preview column clears the docked side toolbar at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const reached = await gotoEditorOrSkip(page);
    test.skip(!reached, 'Editor is sign-in gated; no fixture activity reachable in this run');

    const toolbar = page.getByTestId('editor-side-toolbar');
    const preview = page.getByTestId('quiz-preview-block-1');
    await expect(toolbar).toBeVisible();
    await expect(preview).toBeVisible();

    // The rail computes its own docked position via JS AFTER mount
    // (`EditorSideToolbar.tsx`'s own `useLayoutEffect` sync) — it starts at
    // `{0,0}` for one frame, gated by an opacity class (not `display`), so
    // `toBeVisible()` can resolve before the real position lands. Poll for
    // a plausible docked x (comfortably right of the editor's own columns)
    // instead of trusting the very first bounding box.
    await expect.poll(async () => (await toolbar.boundingBox())?.x ?? 0, { timeout: 60_000 }).toBeGreaterThan(100);

    const toolbarBox = await toolbar.boundingBox();
    const previewBox = await preview.boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    if (!toolbarBox || !previewBox) return;

    // Before the fix the rail covered the last ~28px of this column (the
    // game-mode tabs ended 4px before the toolbar's own left edge).
    expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(toolbarBox.x + 1);
  });

  test('canvas min-height: the template live-preview stage is usable on phone and tablet', async ({ page }) => {
    for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(viewport);
      const reached = await gotoEditorOrSkip(page);
      test.skip(!reached, 'Editor is sign-in gated; no fixture activity reachable in this run');

      // block-2 is the "match"-template block — its own editor renders
      // through `TemplateEditorLayout`'s `.template-stage`, the element this
      // fix targets (Básico's own plain list has no such canvas).
      await goToSheet(page, 2);
      const stage = page.getByTestId('template-stage-block-2');
      await expect(stage).toBeVisible();
      const box = await stage.boundingBox();
      expect(box).not.toBeNull();
      if (!box) continue;

      // Old flat `min-h-[24rem]` (384px) rendered ~330px of actual canvas.
      // New `min-h-[40rem]` (640px) — allow a little slack for borders.
      expect(box.height).toBeGreaterThanOrEqual(600);
    }
  });

  test('"Cambiar imagen" is reachable (not hard-cut) in the phone toolbar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const reached = await gotoEditorOrSkip(page);
    test.skip(!reached, 'Editor is sign-in gated; no fixture activity reachable in this run');

    // block-3 is the worksheet block with an image — only then does the
    // rotate/"Cambiar imagen" cluster portal into the toolbar at all.
    await goToSheet(page, 3);

    const scroll = page.getByTestId('worksheet-tools-scroll');
    const trigger = page.getByTestId('change-image-trigger-block-3');
    // The portal target only grows non-empty once `BlockList`'s own
    // `createPortal` commits into it (a render past the sheet switch) —
    // wait for the trigger itself rather than the (otherwise zero-height,
    // `empty:hidden`) wrapper.
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await expect(scroll).toBeVisible();

    // The edge-fade hint (same recipe the desk levels dock already uses)
    // must be present so a user knows there is more to scroll to.
    const maskImage = await scroll.evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
    expect(maskImage).not.toBe('none');

    // However the user gets there (scroll or otherwise), the button itself
    // must be fully reachable — not clipped mid-icon by its own cluster
    // being wider than the scroll region (the old "half cut" icon).
    await trigger.scrollIntoViewIfNeeded();
    const scrollBox = await scroll.boundingBox();
    const triggerBox = await trigger.boundingBox();
    expect(scrollBox).not.toBeNull();
    expect(triggerBox).not.toBeNull();
    if (!scrollBox || !triggerBox) return;
    expect(triggerBox.x).toBeGreaterThanOrEqual(scrollBox.x - 1);
    expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(scrollBox.x + scrollBox.width + 1);
  });
});
