/**
 * ReactionControl — the identity-backed like/dislike control (slice 9,
 * design.md §4 "API").
 *
 * DORMANT BY DESIGN. The old plan keeps reactions "dormant until traffic
 * exists" — this island is the plumbing that decision needs, not a decision
 * to surface it on any page yet. It is not mounted anywhere in this slice.
 *
 * `authed` IS A PROP, NEVER A SUPABASE CALL (design §2, "Islands receive auth
 * state as a prop"). Identity is resolved once per request by
 * `src/middleware.ts` into `Astro.locals.user`; the calling page passes
 * `authed={user !== null}` down, exactly like `LikeButtonProps` and
 * `SignInForm`. `authed === false` renders NOTHING — there is no anonymous
 * half of this control, unlike `LikeButton`, because a reaction must be
 * traceable to one accountable identity (`POST /api/reacciones/[exerciseId]`
 * answers 401 for the same reason).
 *
 * A DISLIKE NEEDS ITS REASON BEFORE IT CAN BE SENT. The server rejects a
 * reason-less dislike (`exercise_reactions_reason_pairing`,
 * `0009_exercise_reactions.sql`); this control enforces the same rule
 * client-side by simply not sending anything until one of the four taxonomy
 * reasons is picked, rather than sending an invalid request and showing the
 * server's rejection.
 *
 * NO OPTIMISTIC UI, unlike `LikeButton`. There is no count to guess at here —
 * the endpoint deliberately answers `{ ok }` only (no dislike count exposed,
 * design.md §4) — so the only state worth tracking locally is whether the
 * in-flight request is pending and whether the last one the visitor sent was
 * confirmed.
 */
import { useState } from 'react';

/** Mirrors `DISLIKE_REASONS` in `src/lib/reactions.ts` and the SQL taxonomy. */
const DISLIKE_REASONS = ['ambiguous', 'wrong_answer', 'too_hard', 'typo'] as const;
type DislikeReason = (typeof DISLIKE_REASONS)[number];

/** Where a reaction is written. The ONLY writer is the server (see the route). */
export function reactionEndpoint(exerciseId: string): string {
  return `/api/reacciones/${encodeURIComponent(exerciseId)}`;
}

/**
 * This island's own chrome, in both locales. Neutral Latin-American tuteo,
 * no voseo — swept by `findVoseo` from this file's own test, exactly like
 * `LikeButton.COPY` and `SignInForm.COPY`.
 */
export const COPY = {
  es: {
    like: 'Me gusta',
    dislikeReasonLabel: 'Motivo del rechazo',
    reasonPlaceholder: 'Elegir un motivo',
    reasons: {
      ambiguous: 'Enunciado ambiguo',
      wrong_answer: 'Respuesta incorrecta',
      too_hard: 'Demasiado difícil',
      typo: 'Error de tipeo',
    },
    dislikeSend: 'Enviar rechazo',
  },
  en: {
    like: 'Like',
    dislikeReasonLabel: 'Reason for the dislike',
    reasonPlaceholder: 'Choose a reason',
    reasons: {
      ambiguous: 'Ambiguous wording',
      wrong_answer: 'Wrong answer',
      too_hard: 'Too hard',
      typo: 'Typo',
    },
    dislikeSend: 'Send dislike',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface ReactionControlProps {
  /** The exercise being reacted to. Also the endpoint's URL parameter. */
  exerciseId: string;
  /** Server-resolved identity, read from `Astro.locals.user !== null`. */
  authed: boolean;
  /** Locale for {@link COPY}. Unknown values fall back to Spanish. */
  lang: string;
}

export default function ReactionControl({
  exerciseId,
  authed,
  lang,
}: ReactionControlProps) {
  const [reason, setReason] = useState<DislikeReason | ''>('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<'like' | 'dislike' | null>(null);

  // No anonymous half of this control (see the file header) — nothing
  // renders, and no hydration cost is paid, for a visitor with no session.
  if (!authed) return null;

  const t = copyFor(lang);

  async function send(body: { kind: 'like' } | { kind: 'dislike'; reason: DislikeReason }) {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(reactionEndpoint(exerciseId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = res.ok ? await res.json().catch(() => null) : null;
      setSent(payload?.ok ? body.kind : null);
    } catch {
      // Offline or aborted: nothing was recorded, so nothing is claimed.
      setSent(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div data-testid="reaction-control">
      <button
        type="button"
        data-testid="reaction-like"
        aria-pressed={sent === 'like'}
        aria-disabled={pending}
        aria-busy={pending}
        onClick={() => send({ kind: 'like' })}
      >
        {t.like}
      </button>

      <label>
        <span className="sr-only">{t.dislikeReasonLabel}</span>
        <select
          data-testid="reaction-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value as DislikeReason | '')}
        >
          <option value="">{t.reasonPlaceholder}</option>
          {DISLIKE_REASONS.map((r) => (
            <option key={r} value={r}>
              {t.reasons[r]}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        data-testid="reaction-dislike"
        aria-pressed={sent === 'dislike'}
        aria-disabled={pending || reason === ''}
        aria-busy={pending}
        onClick={() => {
          // Mirrors the server's own rejection of a reason-less dislike
          // (`exercise_reactions_reason_pairing`): nothing is sent at all
          // until one taxonomy reason is picked.
          if (reason === '') return;
          void send({ kind: 'dislike', reason });
        }}
      >
        {t.dislikeSend}
      </button>
    </div>
  );
}
