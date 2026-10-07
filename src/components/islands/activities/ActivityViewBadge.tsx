/**
 * ActivityViewBadge — the eye icon + view count, in the practice page's
 * title bar (`/[lang]/ingles/actividades/[id]`, PR D "Activities practice",
 * "desktop" redesign PART 6b owner feedback 2026-10-06).
 *
 * A client-triggered `POST /api/actividades/[id]/visto` right after mount,
 * NOT an awaited call in the page's own SSR frontmatter: recording a view is
 * a cosmetic counter no render should ever wait on, so it happens off the
 * critical path, same reasoning `UserMenu` already established for identity
 * (fetch after mount, render nothing wrong-looking while it is in flight).
 *
 * Renders NOTHING until the count comes back (no flash of a wrong count that
 * then corrects itself) — the request is a single same-origin POST, fast
 * enough that a loading state would only add noise. A failed request also
 * renders nothing: the practice page itself works either way, and a missing
 * view badge is a strictly smaller problem than an error message over
 * someone's practice session.
 *
 * TITLE-BAR ICON, NEXT TO THE HEARTS (owner feedback 2026-10-06, replacing
 * the old "· Ya lo viste · N veces" strip under the title bar): same visual
 * style/size as the author's read-only heart span (`[id].astro`) — an eye
 * icon plus the bare number, `text-sm text-muted-foreground`. The accessible
 * name is always just the count ("23 vistas"); "already seen this" is a
 * tooltip/aria addendum (`title`), never visible strip text, so a guest
 * glancing at the title bar reads the same compact row the owner approved
 * for hearts.
 */
import { useEffect, useState } from 'react';
import { EyeIcon } from '@phosphor-icons/react/dist/ssr/Eye';
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

  // A "returning" view (the second time this signed-in visitor opens this
  // activity, or later) — `recordActivityView`'s own upsert-increment starts
  // at 1 for a first view, so anything above that means they have seen it
  // before.
  const alreadyViewed = viewCount > 1;
  const countLabel = `${viewCount} ${viewCount === 1 ? t.viewsOne : t.viewsMany}`;

  return (
    <span
      data-testid="activity-view-badge"
      aria-label={countLabel}
      title={alreadyViewed ? t.viewedBefore : undefined}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
    >
      <EyeIcon aria-hidden="true" />
      <span className="tabular-nums" aria-hidden="true">{viewCount}</span>
    </span>
  );
}
