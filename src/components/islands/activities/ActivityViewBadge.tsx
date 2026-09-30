/**
 * ActivityViewBadge — "Ya lo viste · N veces" / "Primera vez" in the
 * practice page's header (`/[lang]/ingles/actividades/[id]`, PR D
 * "Activities practice").
 *
 * A client-triggered `POST /api/actividades/[id]/visto` right after mount,
 * NOT an awaited call in the page's own SSR frontmatter: recording a view is
 * a cosmetic counter no render should ever wait on, so it happens off the
 * critical path, same reasoning `UserMenu` already established for identity
 * (fetch after mount, render nothing wrong-looking while it is in flight).
 *
 * Renders NOTHING until the count comes back (no flash of a wrong "Primera
 * vez" that then corrects itself to "Ya lo viste") — the request is a single
 * same-origin POST, fast enough that a loading state would only add noise.
 * A failed request also renders nothing: the practice page itself works
 * either way, and a missing view badge is a strictly smaller problem than an
 * error message over someone's practice session.
 *
 * INLINE, FOLDED INTO THE HEADER'S META LINE (practice player redesign,
 * "compact header row"): `[id].astro` renders this right after the level
 * text on the SAME line ("A2 · Básico · Ya lo viste · 4 veces") instead of
 * its own paragraph — a `<span>` with its own leading "· " separator baked
 * in, so the separator only ever appears together with real text (nothing
 * renders while the count is still in flight, matching the no-flash rule
 * above) and the caller never has to guess whether to render one itself.
 */
import { useEffect, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';

export interface ActivityViewBadgeProps {
  lang: Lang;
  activityId: string;
}

export default function ActivityViewBadge({ lang, activityId }: ActivityViewBadgeProps) {
  const t = UI_LABELS[lang].activities.practice;
  const [viewCount, setViewCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/actividades/${activityId}/visto`, { method: 'POST' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { viewCount?: number } | null) => {
        if (cancelled) return;
        if (typeof data?.viewCount === 'number') setViewCount(data.viewCount);
      })
      .catch(() => {
        // Silently stays unset — see file header.
      });
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  if (viewCount === null) return null;

  return (
    <span data-testid="activity-view-badge">
      · {viewCount <= 1 ? t.viewedFirstTime : `${t.viewedBefore} · ${viewCount} ${t.viewedTimesMany}`}
    </span>
  );
}
