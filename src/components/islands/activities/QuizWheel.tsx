/**
 * QuizWheel — "Ruleta" (batch 1's Wordwall "Spin the wheel"), one of the
 * alternate games a `quiz` block's own questions can be replayed as
 * (`gameModes.ts`'s `deriveGameItems`). An SVG wheel, one slice per item;
 * "Girar" spins it and lands on a seeded-random slice, whose prompt then
 * shows in a card behind a "Ver respuesta" reveal — same reveal shape as
 * `QuizSpeakingCards`. "Eliminar al salir" removes a landed item from the
 * wheel once it has had its turn, so a repeated spin narrows toward the
 * items not yet seen.
 *
 * SELF-CONTAINED, NOT WIRED INTO THE PAGE'S SCORE — same posture as every
 * other alternate game in this file's siblings.
 *
 * THE SPIN IS JS-TIMED (unlike `QuizSpeakingCards`'s pure-CSS deal): the
 * landing slice is picked, and the wheel's CSS `transform: rotate()`
 * transitions to it, but the reveal-worthy "landed" state only commits once
 * that transition has actually finished — a `setTimeout` matching the CSS
 * transition duration, exactly the same "commit after the visual settles"
 * shape `QuizMatching`'s own wrong-answer flash already uses. Duration itself
 * comes from `usePrefersReducedMotion`: ~3s normally, a short flat spin under
 * reduced motion — never instant, since UNLIKE a card flip a wheel spin's
 * MOTION is what tells the learner which slice won.
 */
import { useEffect, useMemo, useState } from 'react';
import { LightbulbIcon } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import SpeakButton from '@/lib/speech/SpeakButton';
import { seedFromString, shuffleWithSeed, type GameItem } from '@/lib/activities/gameModes';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export interface QuizWheelProps {
  lang: Lang;
  items: readonly GameItem[];
  seed: string;
}

/** Alternating brand-palette fills for the slices — same theme tokens `bg-*` utilities already draw from (global.css `@theme`). */
const SEGMENT_FILLS = ['fill-accent', 'fill-primary', 'fill-secondary', 'fill-muted'] as const;

const WHEEL_VIEWBOX = 200;
const WHEEL_CENTER = 100;
const WHEEL_RADIUS = 90;

/** A full spin, normally. */
const NORMAL_SPIN_MS = 3000;
/** A short, still-visible spin under `prefers-reduced-motion` — motion is the mechanic here, so unlike a card flip this is never instant. */
const REDUCED_SPIN_MS = 400;
/** Extra full rotations for visual flourish — skipped under reduced motion. */
const EXTRA_TURNS = 5;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * The SVG path `d` for one pie slice — `index` of `total` equal slices
 * around a circle centered at `(cx, cy)`. Exported and unit-tested directly:
 * arc-sweep geometry is easy to get subtly wrong (wrong large-arc flag,
 * wrong sweep direction) in a way a rendered-DOM test would not catch.
 */
export function wheelSlicePath(cx: number, cy: number, r: number, index: number, total: number): string {
  const segmentAngle = 360 / total;
  const startAngle = index * segmentAngle;
  const endAngle = startAngle + segmentAngle;
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = segmentAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)} Z`;
}

/** A deterministic "random" index in `[0, count)` for a given seed — reuses `shuffleWithSeed` rather than a second PRNG. */
export function pickLandingIndex(count: number, seedValue: number): number {
  return shuffleWithSeed(Array.from({ length: count }, (_, i) => i), seedValue)[0]!;
}

function freshIds(items: readonly GameItem[]): string[] {
  return items.map((item) => item.id);
}

export default function QuizWheel({ lang, items, seed }: QuizWheelProps) {
  const t = UI_LABELS[lang].activities.gameModes;
  const reducedMotion = usePrefersReducedMotion();
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const [activeIds, setActiveIds] = useState<string[]>(() => freshIds(items));
  const [removeOnExit, setRemoveOnExit] = useState(false);
  const [round, setRound] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [landedId, setLandedId] = useState<string | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  // A different block (or its own item list changed) — start over.
  useEffect(() => {
    setActiveIds(freshIds(items));
    setRound(0);
    setRotation(0);
    setSpinning(false);
    setLandedId(undefined);
    setRevealed(false);
    setAnnouncement('');
  }, [items]);

  const activeItems = activeIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const total = activeItems.length;
  const spinMs = reducedMotion ? REDUCED_SPIN_MS : NORMAL_SPIN_MS;
  const landedItem = landedId ? byId.get(landedId) : undefined;

  function handleSpin() {
    if (spinning || total < 2) return;
    const nextRound = round + 1;
    const index = pickLandingIndex(total, seedFromString(`${seed}:wheel:${nextRound}`));
    const segmentAngle = 360 / total;
    const targetCenter = index * segmentAngle + segmentAngle / 2;
    const extraTurns = reducedMotion ? 0 : EXTRA_TURNS;
    // The pointer is fixed at the top (0deg). Rotating the wheel CLOCKWISE
    // brings a later slice under it, so the delta needed to land slice
    // `index` under the pointer is `360 - targetCenter`, adjusted for
    // whatever rotation is already applied (kept cumulative so every spin
    // visibly turns forward, never snapping backwards).
    const currentMod = ((rotation % 360) + 360) % 360;
    const delta = (((360 - targetCenter - currentMod) % 360) + 360) % 360;

    setRound(nextRound);
    setSpinning(true);
    setRevealed(false);
    setLandedId(undefined);
    setAnnouncement(t.wheelSpinning);
    setRotation((prev) => prev + extraTurns * 360 + delta);

    setTimeout(() => {
      const landed = activeItems[index];
      setSpinning(false);
      if (!landed) return;
      setLandedId(landed.id);
      setAnnouncement(`${t.wheelLandedPrefix} ${landed.prompt}`);
      if (removeOnExit) {
        setActiveIds((prev) => prev.filter((id) => id !== landed.id));
      }
    }, spinMs);
  }

  function handleReveal() {
    setRevealed(true);
  }

  if (items.length < 2) return null;

  return (
    <div data-testid="quiz-wheel" className="flex flex-col items-center gap-4">
      <div aria-live="polite" role="status" className="sr-only" data-testid="wheel-live-region">
        {announcement}
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground sm:min-h-0">
        <input
          type="checkbox"
          data-testid="wheel-remove-on-exit"
          checked={removeOnExit}
          onChange={(e) => setRemoveOnExit(e.target.checked)}
          className="size-4"
        />
        {t.wheelRemoveOnExit}
      </label>

      {total >= 2 ? (
        <>
          <svg
            data-testid="wheel-svg"
            viewBox={`0 0 ${WHEEL_VIEWBOX} ${WHEEL_VIEWBOX}`}
            aria-hidden="true"
            className="h-56 w-56 transition-transform ease-out motion-reduce:transition-none"
            style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${spinMs}ms` }}
          >
            {activeItems.map((item, index) => (
              <path
                key={item.id}
                data-testid={`wheel-segment-${item.id}`}
                d={wheelSlicePath(WHEEL_CENTER, WHEEL_CENTER, WHEEL_RADIUS, index, total)}
                className={cn('stroke-surface', SEGMENT_FILLS[index % SEGMENT_FILLS.length])}
                strokeWidth={1}
              />
            ))}
          </svg>

          <Button
            type="button"
            data-testid="wheel-spin"
            onClick={handleSpin}
            disabled={spinning}
            aria-busy={spinning}
            className="h-11 sm:h-8"
          >
            {spinning ? t.wheelSpinning : t.wheelSpin}
          </Button>
        </>
      ) : (
        <p data-testid="wheel-exhausted" className="text-sm text-muted-foreground">
          {t.wheelExhausted}
        </p>
      )}

      {landedItem && !spinning && (
        <div
          data-testid="wheel-landed"
          className="flex w-full max-w-md flex-col items-center gap-3 rounded-lg border-2 border-border bg-surface-soft p-6 text-center"
        >
          <p className="text-lg font-semibold text-foreground sm:text-xl">{landedItem.prompt}</p>
          <SpeakButton text={landedItem.prompt} lang={lang} />
          {revealed ? (
            <div
              data-testid="wheel-answer"
              className="flex flex-col items-center gap-2 rounded-md border border-accent-ink bg-accent/10 p-3"
            >
              <p className="text-lg font-semibold text-foreground">{landedItem.answer}</p>
              {landedItem.explanation && (
                <div className="flex items-start gap-1.5 text-left text-sm text-foreground">
                  <LightbulbIcon aria-hidden="true" weight="fill" className="mt-0.5 shrink-0 text-hint" />
                  <p>{landedItem.explanation}</p>
                </div>
              )}
            </div>
          ) : (
            <Button type="button" variant="outline" data-testid="wheel-reveal" onClick={handleReveal} className="h-11 sm:h-8">
              {t.wheelReveal}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
