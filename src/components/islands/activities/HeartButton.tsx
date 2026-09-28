/**
 * HeartButton — the "corazón" (like) toggle in the practice page's header
 * (`/[lang]/ingles/actividades/[id]`, Descubrir "discovery"). Only mounted
 * for a signed-in visitor who is NOT the activity's own author — the page
 * shows the count read-only for the author instead (`[id].astro`'s own
 * gate, same "don't render what should not exist" posture as
 * `ReportActivityButton`'s own header). `POST /api/actividades/[id]/corazon`
 * refuses a self-heart again server-side (`toggleActivityHeart`'s own
 * header) — this is only the UI-level courtesy of not offering the control.
 *
 * OPTIMISTIC UPDATE WITH ROLLBACK, the same shape as `LikeButton`
 * (`@components/islands/LikeButton`, curated exercises): both the count and
 * the pressed state flip immediately on click, and the server's response —
 * or its absence — is the only thing that gets to keep that guess. A number
 * or boolean answered by the server always REPLACES the guess (so a heart
 * added elsewhere while this request was in flight is absorbed correctly);
 * anything else rolls both halves of the guess back together.
 *
 * COLOR: filled + `text-destructive` (warm red) once hearted, rather than
 * the brand yellow `text-accent` `LikeButton` uses — accent yellow already
 * marks active/selected chrome everywhere else on this page (level badges,
 * focus rings), so a hearted state in the same hue would not read as its
 * own signal. Red is also the closer match to "hearted" as a color the web
 * already trains people to expect.
 */
import { useState } from 'react';
import { HeartIcon } from '@phosphor-icons/react/dist/ssr/Heart';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface HeartButtonProps {
  lang: Lang;
  activityId: string;
  /** The count rendered on the server. */
  heartCount: number;
  /** Whether the signed-in caller already hearted this activity (SSR lookup, `[id].astro`'s own loader). */
  hearted: boolean;
}

export default function HeartButton({ lang, activityId, heartCount: initialCount, hearted: initialHearted }: HeartButtonProps) {
  const t = UI_LABELS[lang].activities.practice;
  const [count, setCount] = useState(initialCount);
  const [hearted, setHearted] = useState(initialHearted);
  const [pending, setPending] = useState(false);

  async function toggle() {
    // Guarded here rather than by `disabled` — see `LikeButton`'s own note
    // on why a disabled element would drop focus.
    if (pending) return;

    const confirmedCount = count;
    const wasHearted = hearted;

    setHearted(!wasHearted);
    setPending(true);
    setCount(wasHearted ? Math.max(confirmedCount - 1, 0) : confirmedCount + 1);

    try {
      const res = await fetch(`/api/actividades/${activityId}/corazon`, { method: 'POST' });
      const body: { hearted?: unknown; heartCount?: unknown } | null = res.ok
        ? await res.json().catch(() => null)
        : null;

      if (body && typeof body.heartCount === 'number' && typeof body.hearted === 'boolean') {
        setCount(body.heartCount);
        setHearted(body.hearted);
      } else {
        setCount(confirmedCount);
        setHearted(wasHearted);
      }
    } catch {
      setCount(confirmedCount);
      setHearted(wasHearted);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void toggle()}
      aria-pressed={hearted}
      aria-disabled={pending}
      aria-busy={pending}
      data-testid="activity-heart-button"
      className={cn(hearted && 'border-destructive/40 text-destructive')}
    >
      <HeartIcon aria-hidden="true" weight={hearted ? 'fill' : 'regular'} />
      <span className="sr-only">{hearted ? t.heartRemove : t.heartAdd}</span>
      <span className="tabular-nums">{count}</span>
    </Button>
  );
}
