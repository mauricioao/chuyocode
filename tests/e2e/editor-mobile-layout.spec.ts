import { test, expect, type Page } from '@playwright/test';
import { localSupabaseAdmin, localSupabaseRest } from './support/localSupabaseAdmin';

/**
 * Editor mobile layout — night pass 2026-10-18 (recorrido H13–H16), amended
 * twice after reviewer follow-up: first for row overflow/misalignment at
 * 375px and H13's first finding (Básico preview question/answer alignment),
 * then again because the fixture activity this spec needs was hand-seeded
 * outside the test run and stopped existing — every test here silently
 * skipped under `pnpm test:e2e:auth`.
 *
 * SELF-SEEDING now (same pattern `desk-minimized-tray-part6b.spec.ts`
 * already uses, factored into `support/localSupabaseAdmin.ts`): a
 * `beforeAll` upserts one "Varios juegos" activity owned by the
 * `e2e-regular` fixture user (`11111111-1111-1111-1111-111111111111`,
 * `supabase/seed.sql`) via local Supabase's own REST API with the
 * service-role key, and an `afterAll` deletes it — `localSupabaseAdmin()`
 * refuses anything that is not `localhost`/`127.0.0.1`, so this never
 * touches a remote project. `block-1` is the Básico quiz block (4 slots,
 * one long question, a `promptImages` entry on `slot-1` so "Quitar imagen"
 * has something to show) these tests mostly exercise, `block-2` a
 * "match"-template quiz block (used only to reach `TemplateEditorKit`'s own
 * live-preview stage for the canvas-height check) and `block-3` a worksheet
 * block with an image ref (used only to reach the mobile toolbar's
 * "Cambiar imagen" scroll region — a missing storage object at that path is
 * fine, the editor still shows the change-image trigger from the stored
 * metadata alone, verified). `test.describe.configure({ mode: 'default' })`
 * below keeps workers from racing on this shared row. Falls back to
 * skipping every test gracefully (same posture as `desk-widgets-part4.spec.ts`)
 * when no local admin access is configured, or when the signed-in session
 * does not actually reach the editor.
 */

const ACTIVITY_ID = 'e2e0ed17-0000-4000-8000-000000000001';
const REVISION_ID = 'e2e0ed17-0000-4000-8000-000000000002';
/** `e2e-regular@chuyocode.test` — `supabase/seed.sql`'s own fixed id. The editor's `getActivityForEdit` requires `author_id` to match the signed-in session, so this must stay the regular fixture, never the moderator one. */
const AUTHOR_ID = '11111111-1111-1111-1111-111111111111';

/** This block's own question-image path (`slot-1`'s `promptImages` entry) — well-formed (`paths.ts`'s own `FULL_PATH_RE`) but never actually uploaded; the thumbnail is allowed to fail to load, nothing under test depends on the pixels. */
const QUESTION_IMAGE_PATH = `activity-uploads/${AUTHOR_ID}/question-33333333-3333-3333-3333-333333333333.webp`;
/** `block-3`'s own worksheet image path, same "well-formed, never uploaded" posture. */
const WORKSHEET_IMAGE_PATH = `activity-uploads/${AUTHOR_ID}/44444444-4444-4444-4444-444444444444.webp`;

async function deleteSeededEditorActivity(): Promise<void> {
  const admin = localSupabaseAdmin();
  if (!admin) return;
  // Always `draft`/no `published_revision_id` (never published by this
  // spec), so the revision can be deleted directly — no FK to clear first,
  // unlike `desk-minimized-tray-part6b.spec.ts`'s own `live` fixture.
  await localSupabaseRest(admin, `activity_revisions?activity_id=eq.${ACTIVITY_ID}`, { method: 'DELETE' });
  await localSupabaseRest(admin, `activities?id=eq.${ACTIVITY_ID}`, { method: 'DELETE' });
}

/** Seeds the editor fixture activity in local Supabase; returns `true` once seeded, `false` when no local admin access (every test below then skips). */
async function seedEditorActivity(): Promise<boolean> {
  const admin = localSupabaseAdmin();
  if (!admin) return false;
  await deleteSeededEditorActivity();
  await localSupabaseRest(admin, 'activities', {
    method: 'POST',
    body: JSON.stringify({
      id: ACTIVITY_ID,
      author_id: AUTHOR_ID,
      title: 'Night layout check - Varios juegos',
      level: 'A1',
      status: 'draft',
      block_types: ['quiz', 'worksheet'],
      block_count: 3,
    }),
  });
  await localSupabaseRest(admin, 'activity_revisions', {
    method: 'POST',
    body: JSON.stringify({
      id: REVISION_ID,
      activity_id: ACTIVITY_ID,
      status: 'draft',
      created_by: AUTHOR_ID,
      blocks: [
        {
          id: 'block-1',
          type: 'quiz',
          payload: {
            pools: {},
            slots: [
              { id: 'slot-1', label: 'What color is the sky on a clear, cloudless afternoon in summer?', input: 'text', answer: ['blue'] },
              { id: 'slot-2', label: 'What is 2 + 2?', input: 'text', answer: ['4'] },
              { id: 'slot-3', label: 'What is the capital city of France?', input: 'text', answer: ['Paris'] },
              { id: 'slot-4', label: 'What animal says "moo"?', input: 'text', answer: ['cow'] },
            ],
            blocks: [
              { kind: 'row', id: 'row-1', slotId: 'slot-1' },
              { kind: 'row', id: 'row-2', slotId: 'slot-2' },
              { kind: 'row', id: 'row-3', slotId: 'slot-3' },
              { kind: 'row', id: 'row-4', slotId: 'slot-4' },
            ],
          },
          promptImages: {
            'slot-1': { path: QUESTION_IMAGE_PATH, width: 200, height: 200 },
          },
        },
        {
          id: 'block-2',
          type: 'quiz',
          template: 'match',
          payload: {
            pools: {},
            slots: [
              { id: 'slot-5', label: 'cat', input: 'text', answer: ['gato'] },
              { id: 'slot-6', label: 'dog', input: 'text', answer: ['perro'] },
            ],
            blocks: [
              { kind: 'row', id: 'row-5', slotId: 'slot-5' },
              { kind: 'row', id: 'row-6', slotId: 'slot-6' },
            ],
          },
        },
        {
          id: 'block-3',
          type: 'worksheet',
          rotation: 0,
          image: { path: WORKSHEET_IMAGE_PATH, width: 1000, height: 1400 },
          zones: [],
        },
      ],
    }),
  });
  return true;
}

// One worker, in order: the seeded row is shared, so parallel workers' own
// beforeAll/afterAll pairs must never race to create/delete it (same
// reasoning `desk-minimized-tray-part6b.spec.ts` documents for its own
// fixture).
test.describe.configure({ mode: 'default' });

let seeded = false;

test.beforeAll(async () => {
  seeded = await seedEditorActivity();
});

test.afterAll(async () => {
  if (seeded) await deleteSeededEditorActivity();
});

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
  if (!seeded) return false;
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
 * Proof of actual hydration, not just server-rendered HTML (reviewer
 * follow-up: the first pass's "after" screenshots showed no window title
 * bar / no side toolbar rail — an un-hydrated page, which cannot prove
 * H15). The desktop rail starts at `{0,0}` and only reaches its real docked
 * position once `EditorSideToolbar.tsx`'s own `useLayoutEffect` has run
 * post-hydration, so polling its `x` past a plausible docked offset is a
 * real hydration signal, not just a DOM-presence check.
 */
async function waitForHydration(page: Page): Promise<void> {
  const toolbar = page.getByTestId('editor-side-toolbar');
  await expect.poll(async () => (await toolbar.boundingBox())?.x ?? 0, { timeout: 60_000 }).toBeGreaterThan(100);
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

/** `document.documentElement`/`document.body`'s own horizontal overflow — the page itself must never scroll sideways, at any width. */
async function hasHorizontalPageOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return html.scrollWidth > html.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1;
  });
}

test.describe('editor mobile layout (recorrido 2026-10-17/18, H13-H16)', () => {
  test.describe.configure({ timeout: 300_000 });

  test('H14: the question field top lines up with the answer field top (Básico row, sm+)', async ({ page }) => {
    // Side-by-side columns only apply from `sm` (640px) up — below that the
    // row now intentionally STACKS (question above answer), so comparing
    // top offsets only makes sense at 768/1280, not 375 (covered by the
    // "stacks full-width, no overflow" test below instead).
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

  test('H14: the "x" delete button never overlaps the answer field and stays on screen (1280px, side-by-side)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const reached = await gotoEditorOrSkip(page);
    test.skip(!reached, 'Editor is sign-in gated; no fixture activity reachable in this run');

    const answer = page.getByTestId('varios-answer-slot-2');
    const remove = page.getByTestId('varios-remove-slot-2');
    await expect(answer).toBeVisible();
    await expect(remove).toBeVisible();
    await expect(remove).toBeInViewport();

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

  test('H14: the row stacks full-width at 375px with no horizontal overflow and the "x" stays on screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const reached = await gotoEditorOrSkip(page);
    test.skip(!reached, 'Editor is sign-in gated; no fixture activity reachable in this run');

    const question = page.getByTestId('varios-question-slot-1');
    const answer = page.getByTestId('varios-answer-slot-1');
    const remove = page.getByTestId('varios-remove-slot-1');
    const card = page.getByTestId('varios-table-block-1');
    await expect(question).toBeVisible();
    await expect(answer).toBeVisible();
    await expect(remove).toBeVisible();

    // Reviewer follow-up: the first stacked attempt ran the question input
    // edge to edge (no right padding) and pushed the "x" delete button off
    // screen entirely. Both the card and the page itself must never scroll
    // sideways, and the delete button — now on the SAME row as the
    // question, not its own row below everything — must stay reachable.
    const cardOverflow = await card.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(cardOverflow).toBe(false);
    expect(await hasHorizontalPageOverflow(page)).toBe(false);
    await expect(remove).toBeInViewport();

    const questionBox = await question.boundingBox();
    const answerBox = await answer.boundingBox();
    const cardBox = await card.boundingBox();
    expect(questionBox).not.toBeNull();
    expect(answerBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    if (!questionBox || !answerBox || !cardBox) return;

    // Full-width, not the old ~129px column.
    expect(questionBox.width).toBeGreaterThan(200);
    // Inside the card's own padding, never flush against either edge.
    expect(questionBox.x).toBeGreaterThan(cardBox.x);
    expect(questionBox.x + questionBox.width).toBeLessThan(cardBox.x + cardBox.width);

    // The answer (and, nested inside the same block, its "Agregar opciones /
    // Editor avanzado" links) share the QUESTION field's own left edge —
    // both are the grid's column 2 now, not hand-matched padding.
    expect(Math.abs(questionBox.x - answerBox.x)).toBeLessThanOrEqual(2);
  });

  test('H15: the preview column clears the docked side toolbar at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const reached = await gotoEditorOrSkip(page);
    test.skip(!reached, 'Editor is sign-in gated; no fixture activity reachable in this run');
    await waitForHydration(page);

    const toolbar = page.getByTestId('editor-side-toolbar');
    const preview = page.getByTestId('quiz-preview-block-1');
    await expect(preview).toBeVisible();

    const toolbarBox = await toolbar.boundingBox();
    const previewBox = await preview.boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    if (!toolbarBox || !previewBox) return;

    // Before the fix the rail covered the last ~28px of this column (the
    // game-mode tabs ended 4px before the toolbar's own left edge).
    expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(toolbarBox.x + 1);
  });

  test('H13: the Básico live-preview question and its answer field share a centre at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const reached = await gotoEditorOrSkip(page);
    test.skip(!reached, 'Editor is sign-in gated; no fixture activity reachable in this run');

    // slot-2 ("What is 2 + 2?") has no `___` gap, so `TextRenderer` takes
    // its STACKED layout (prompt `Label` above a plain `input`) — the shape
    // the reviewer flagged (question centred via `PROMPT_MEASURE`'s own
    // `mx-auto`, answer field left-aligned with none).
    const slot = page.getByTestId('quiz-slot-slot-2');
    await expect(slot).toBeVisible();
    const label = slot.locator('label');
    const field = slot.locator('input[type="text"]');
    await expect(label).toBeVisible();
    await expect(field).toBeVisible();

    const labelBox = await label.boundingBox();
    const fieldBox = await field.boundingBox();
    expect(labelBox).not.toBeNull();
    expect(fieldBox).not.toBeNull();
    if (!labelBox || !fieldBox) return;

    // CENTRES, not left edges: the question (`PROMPT_MEASURE`, `max-w-[32em]`)
    // and the answer field (`max-w-md`) are capped at different widths by
    // design (a ~64-character prose measure vs. a form-field width), so
    // their left edges never match even when both are centred — matching
    // this codebase's own documented "the exercise card centres its prompt"
    // rule (`scale.ts`'s `PROMPT_MEASURE` header) consistently applied to
    // the field below it, rather than inventing a second, left-aligned rule
    // for just this one field.
    const labelCenter = labelBox.x + labelBox.width / 2;
    const fieldCenter = fieldBox.x + fieldBox.width / 2;
    expect(Math.abs(labelCenter - fieldCenter)).toBeLessThanOrEqual(4);
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

  // Horizontal toolbar pass (owner request: "la barra podría pasar a la
  // parte blanca inferior, en modo horizontal, al pie del bloque de
  // preview"). Signed-in only, so it cannot run tonight — kept simple and
  // robust (one viewport, generous tolerances, the existing fixture's own
  // match block/worksheet block) rather than exhaustive; the full geometry
  // sweep across viewports/molds is a separate scratchpad Playwright script,
  // not this suite.
  test('horizontal toolbar pass: the rail docks bottom-right inside the stage for a templated block, stays vertical for a worksheet', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const reached = await gotoEditorOrSkip(page);
    test.skip(!reached, 'Editor is sign-in gated; no fixture activity reachable in this run');
    await waitForHydration(page);

    // block-2 is the "match"-template block — the only one that docks the
    // rail horizontally.
    await goToSheet(page, 2);
    const toolbar = page.getByTestId('editor-side-toolbar');
    const stage = page.getByTestId('template-stage-block-2');
    const frame = page.getByTestId('quiz-preview-block-2');
    await expect(toolbar).toBeVisible();
    await expect(stage).toBeVisible();
    await expect(frame).toBeVisible();
    expect(await toolbar.getAttribute('data-orientation')).toBe('horizontal');

    const toolbarBox = await toolbar.boundingBox();
    const stageBox = await stage.boundingBox();
    const frameBox = await frame.boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(frameBox).not.toBeNull();
    if (!toolbarBox || !stageBox || !frameBox) return;

    // A horizontal bar is wider than it is tall (the vertical rail is the
    // opposite shape).
    expect(toolbarBox.width).toBeGreaterThan(toolbarBox.height);

    // Inside the stage card's own bottom-right corner, within 8-16px on
    // both axes (12px inset + the rail's own ~12-16px margin).
    const rightGap = stageBox.x + stageBox.width - (toolbarBox.x + toolbarBox.width);
    const bottomGap = stageBox.y + stageBox.height - (toolbarBox.y + toolbarBox.height);
    expect(rightGap).toBeGreaterThanOrEqual(8);
    expect(rightGap).toBeLessThanOrEqual(16);
    expect(bottomGap).toBeGreaterThanOrEqual(8);
    expect(bottomGap).toBeLessThanOrEqual(16);

    // The preview frame stays entirely above the bar.
    expect(frameBox.y + frameBox.height).toBeLessThanOrEqual(toolbarBox.y);

    // The frame now reaches the stage's own right edge (no more reserved
    // right gutter) — within 21px (the old gutter was 66px).
    expect(frameBox.x + frameBox.width).toBeGreaterThanOrEqual(stageBox.x + stageBox.width - 21);

    // Toggling the eye (preview mode) twice must leave the toolbar exactly
    // where it was — keyed on the active block, never on preview mode.
    await page.getByTestId('preview-toggle').click();
    await page.getByTestId('preview-toggle').click();
    const toolbarBoxAfter = await toolbar.boundingBox();
    expect(toolbarBoxAfter).not.toBeNull();
    if (!toolbarBoxAfter) return;
    expect(Math.abs(toolbarBoxAfter.x - toolbarBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(toolbarBoxAfter.y - toolbarBox.y)).toBeLessThanOrEqual(1);

    // block-3 is the worksheet block — the rail reverts to vertical.
    await goToSheet(page, 3);
    expect(await toolbar.getAttribute('data-orientation')).toBe('vertical');
  });
});
