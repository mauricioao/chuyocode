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
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import SpeakButton from '@/lib/speech/SpeakButton';
import { seedFromString, shuffleWithSeed, type GameItem } from '@/lib/activities/gameModes';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { PromptImageRef } from '@/lib/activities/blocks';
import PromptImage from '@/components/islands/mechanics/PromptImage';
import { optionFillClass } from '@/components/islands/mechanics/palette';
import { AnswerReveal, SINGLE_CARD, SINGLE_CARD_PROMPT } from '@/components/islands/mechanics/singleCard';

export interface QuizWheelProps {
  lang: Lang;
  items: readonly GameItem[];
  seed: string;
  /** This block's own `promptImages` map (owner decision 2026-10-16 follow-up), keyed by slot id — `undefined` = no question images authored, the common case. Display-only; see `PromptImage`'s own header. */
  promptImages?: Record<string, PromptImageRef>;
}

/**
 * Which shared-palette colour (`palette.ts`, by position) slice `index` of
 * `total` gets. Plain position, EXCEPT the one case where cycling the six
 * colours would paint the last slice the same as the first one it touches
 * around the circle (`total` = 7, 13, …) — two same-coloured neighbours
 * would read as one big slice, so that last slice takes a colour neither
 * neighbour uses instead.
 */
export function wheelSegmentColorIndex(index: number, total: number): number {
  if (total % 6 === 1 && index === total - 1) return 2;
  return index;
}

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

export default function QuizWheel({ lang, items, seed, promptImages }: QuizWheelProps) {
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

      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground sm:min-h-0">
        <input
          type="checkbox"
          data-testid="wheel-remove-on-exit"
          checked={removeOnExit}
          onChange={(e) => setRemoveOnExit(e.target.checked)}
          className="size-4 accent-pop-sky-deep"
        />
        {t.wheelRemoveOnExit}
      </label>

      {total >= 2 ? (
        <>
          {/* The wheel sits on a soft kit shadow (a round card, never a
              halo glow); the fixed ink pointer at 12 o'clock is drawn
              OUTSIDE the rotating SVG so it never turns with it — it marks
              the slice `handleSpin`'s own geometry lands under the top. */}
          <div className="relative">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 18"
              className="absolute -top-2 left-1/2 z-10 h-[18px] w-5 -translate-x-1/2 fill-foreground"
            >
              <path d="M2 1 H18 Q19.5 1 18.6 2.3 L10.9 16.6 Q10 18 9.1 16.6 L1.4 2.3 Q0.5 1 2 1 Z" />
            </svg>
            <svg
              data-testid="wheel-svg"
              viewBox={`0 0 ${WHEEL_VIEWBOX} ${WHEEL_VIEWBOX}`}
              aria-hidden="true"
              className="size-64 rounded-full shadow-(--shadow-elevation-2) transition-transform ease-out motion-reduce:transition-none sm:size-72"
              style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${spinMs}ms` }}
            >
              <circle cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={WHEEL_VIEWBOX / 2} className="fill-card" />
              {activeItems.map((item, index) => (
                <path
                  key={item.id}
                  data-testid={`wheel-segment-${item.id}`}
                  d={wheelSlicePath(WHEEL_CENTER, WHEEL_CENTER, WHEEL_RADIUS, index, total)}
                  className={cn('stroke-card', optionFillClass(wheelSegmentColorIndex(index, total)))}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              ))}
              <circle cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={13} className="fill-card" />
              <circle cx={WHEEL_CENTER} cy={WHEEL_CENTER} r={4} className="fill-foreground" />
            </svg>
          </div>

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
        <p data-testid="wheel-exhausted" className="text-sm font-medium text-muted-foreground">
          {t.wheelExhausted}
        </p>
      )}

      {landedItem && !spinning && (
        <div data-testid="wheel-landed" className={SINGLE_CARD}>
          <PromptImage image={promptImages?.[landedItem.id]} />
          <p className={SINGLE_CARD_PROMPT}>{landedItem.prompt}</p>
          <SpeakButton text={landedItem.prompt} lang={lang} />
          {revealed ? (
            <AnswerReveal data-testid="wheel-answer" answer={landedItem.answer} explanation={landedItem.explanation} />
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
