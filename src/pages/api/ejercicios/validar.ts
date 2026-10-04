/**
 * POST /api/ejercicios/validar — server-authoritative validation for the
 * authoring panel (slice 17, design.md §8: "the authoring island runs the
 * same pure function for live feedback"; design.md §7: "Where it runs").
 *
 * STATELESS, ZERO I/O, NO AUTH GATE. It runs the exact two pure gates
 * `guardar.ts` runs — `parsePayload` then `validateExercise` — over
 * caller-supplied input and reports the result. There is no row to read or
 * write and nothing session-dependent to leak, so this endpoint needs
 * neither `locals.user` nor a Supabase client: unlike `guardar.ts`, a
 * mismatched or anonymous caller learns nothing about any real exercise,
 * only whether the payload THEY sent would validate.
 *
 * NOT CURRENTLY CALLED BY THE AUTHORING UI. `validateExercise` is already a
 * pure, zero-I/O function bundled into the client
 * (`ExerciseAuthorIsland.tsx` imports from the same `src/lib` tree), so a
 * live-feedback panel can call it directly with no network round trip. This
 * endpoint exists for a server-authoritative check independent of the
 * client bundle (design.md §8's own wording), and is ready to be wired to a
 * future authoring panel once one exists.
 */
import type { APIRoute } from 'astro';
import { jsonResponse } from '@lib/apiResponse';
import { parsePayload } from '@lib/exercisePayload';
import { validateExercise } from '@lib/exerciseValidator';

interface ValidateInput {
  skill: string;
  level: string;
  focus: string;
  slug: string;
  payload: unknown;
}

function isValidateInput(value: unknown): value is ValidateInput {
  if (typeof value !== 'object' || value === null) return false;
  const { skill, level, focus, slug, payload } = value as Record<string, unknown>;
  return (
    typeof skill === 'string' &&
    typeof level === 'string' &&
    typeof focus === 'string' &&
    typeof slug === 'string' &&
    typeof payload === 'object' &&
    payload !== null
  );
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, code: 'bad_request' }, 400);
  }
  if (!isValidateInput(body)) {
    return jsonResponse({ ok: false, code: 'bad_request' }, 400);
  }

  const payload = parsePayload(body.payload);
  if (!payload) {
    return jsonResponse({ ok: false, code: 'payload_unparseable' }, 422);
  }

  const result = validateExercise({
    skill: body.skill,
    level: body.level,
    focus: body.focus,
    slug: body.slug,
    payload,
  });

  return jsonResponse({ ok: result.ok, issues: result.issues }, 200);
};
