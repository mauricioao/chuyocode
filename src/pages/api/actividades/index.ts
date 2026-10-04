/**
 * `POST /api/actividades` — create a brand-new activity (PR B, "Activities
 * creator"). The start screen (`/[lang]/crear`) never collects a title or
 * level up front — those are edited later in the editor's top bar — so this
 * endpoint always assigns the localized default title
 * (`UI_LABELS[lang].activities.untitledTitle`) and a `null` level, then
 * creates the activity's first `draft` revision from the caller-supplied
 * `blocks` in the SAME call:
 *
 * ```
 * 1. locals.user null                    -> 401
 * 2. bad JSON / wrong shape              -> 400
 * 3. lang not es/en                      -> 400
 * 4. parseBlocks(blocks, 'draft')        -> 422 { error: 'invalid_blocks' }
 *    === null (tolerant — the start
 *    screen may seed one empty-state
 *    block of the chosen type)
 * 5. a worksheet image.path is not the   -> 422 { error: 'invalid_image_path' }
 *    caller's OWN upload path (no
 *    activity id exists yet to reference
 *    an `activity-images/...` copy)
 * 6. createActivity(...) === null        -> 500 { error: 'create_failed' }
 * 7. success                             -> 200 { id }
 * ```
 *
 * Every response is private/no-store (T7): it is read off `locals.user`, and
 * a shared cache serving it to a different visitor would leak both identity
 * and content.
 */
import type { APIRoute } from 'astro';
import { jsonResponse, requireUser } from '@lib/apiResponse';
import { isValidLang, UI_LABELS, type Lang } from '@lib/i18n';
import { parseBlocks, type Block } from '@lib/activities/blocks';
import { isOwnUploadPath } from '@lib/activities/paths';
import { createActivity } from '@lib/activities/activities';

interface CreateInput {
  lang: unknown;
  blocks: unknown;
}

function isCreateInput(value: unknown): value is CreateInput {
  if (typeof value !== 'object' || value === null) return false;
  return 'lang' in value && 'blocks' in value;
}

/**
 * Every worksheet block's `image.path` must be the caller's OWN upload path
 * — a block with no image yet (the editor's own empty-state block, `'draft'`
 * mode only — see `blocks.ts`'s `parseWorksheetBlock`) has nothing to check.
 */
function everyImageOwnedByCaller(blocks: Block[], userId: string): boolean {
  return blocks.every((block) => {
    if (block.type !== 'worksheet' || !block.image) return true;
    return isOwnUploadPath(block.image.path, userId);
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }
  if (!isCreateInput(body)) {
    return jsonResponse({ error: 'bad_request' }, 400);
  }

  const lang: Lang | null = isValidLang(body.lang) ? body.lang : null;
  if (!lang) {
    return jsonResponse({ error: 'bad_request' }, 400);
  }

  // `'draft'` (creator polish round 4, owner feedback #2, "first block
  // visible"): the start screen now seeds the brand-new activity with one
  // block of the chosen type in THIS same call — a worksheet block with no
  // image yet, or an empty quiz block — same tolerant posture `guardar.ts`
  // already uses for every later autosave.
  const blocks = parseBlocks(body.blocks, 'draft');
  if (!blocks) {
    return jsonResponse({ error: 'invalid_blocks' }, 422);
  }

  if (!everyImageOwnedByCaller(blocks, user.id)) {
    return jsonResponse({ error: 'invalid_image_path' }, 422);
  }

  const id = await createActivity(user.id, {
    title: UI_LABELS[lang].activities.untitledTitle,
    level: null,
    blocks,
  });
  if (!id) {
    return jsonResponse({ error: 'create_failed' }, 500);
  }

  return jsonResponse({ id }, 200);
};
