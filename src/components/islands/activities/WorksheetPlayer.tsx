/**
 * WorksheetPlayer — renders a worksheet block the way a LEARNER sees it:
 * the image, with one input/select positioned over each zone (PR B,
 * "Activities creator" — the editor's own preview mode). Kept as its own
 * component, separate from the editor, so PR D's real practice player could
 * mount it unchanged — and does, via the optional `practice` prop below.
 *
 * TWO MODES, one component:
 *  - `practice` omitted (default): the editor's creator-preview mode —
 *    uncontrolled inputs, nothing graded, the "Vista previa" notice shown.
 *    Unchanged from PR B.
 *  - `practice` given (PR D, "Activities practice"): the real learner
 *    player — CONTROLLED inputs bound to `practice.values`/`onChange`, no
 *    "not graded" notice, and — once `practice.results` is provided by the
 *    caller's own "Comprobar" action — each zone gets a green/red ring plus
 *    an accessible correct/incorrect label. `practice.disabled` locks every
 *    input after grading, until the caller's own "Reintentar" clears
 *    `results` and re-enables them. `WorksheetPracticePlayer` is the caller
 *    that supplies all of this, wrapped with zoom controls.
 *
 * Positioning is pure CSS percentages derived from each {@link Zone}'s
 * fractional `x`/`y`/`w`/`h` — the same fractions `parseZone` accepts —
 * inside a container whose aspect ratio is pinned to the image's own
 * `width`/`height`, so a zone always lines up with the artwork underneath it
 * regardless of how wide the container is actually rendered.
 */
import { useEffect, useRef, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { ImageRef, Rotation, Zone } from '@/lib/activities/blocks';
import { rotatedSize } from '@/lib/activities/canvasViewport';
import { zoneAnswerFontSize } from '@/lib/activities/zoneAnswerDisplay';
import { cn } from '@/lib/utils';

/** PR D, "Activities practice" — turns the creator preview into a gradable, controlled player. See file header. */
export interface WorksheetPracticeState {
  /** zone id -> the learner's current answer (text) or selected option (choice). */
  values: Record<string, string>;
  onChange: (zoneId: string, value: string) => void;
  /** zone id -> correct/incorrect, present only once graded. Absent entirely = not graded yet. */
  results?: Record<string, boolean>;
  /** Locks every input once graded, until "Reintentar" clears `results`. */
  disabled?: boolean;
}

export interface WorksheetPlayerProps {
  lang: Lang;
  image: ImageRef;
  zones: Zone[];
  /** Resolved, browser-loadable URL for `image.path` (caller resolves it). */
  imageUrl: string;
  /** The worksheet's own rotation (creator polish round 2) — rendered here exactly like the editor. */
  rotation?: Rotation;
  /** Omitted = creator preview (PR B, unchanged). Given = the real practice player (PR D). See file header. */
  practice?: WorksheetPracticeState;
  /**
   * Mobile layout pass: when given (only meaningful together with
   * `practice`), every zone renders as a TAP TARGET — the learner's current
   * answer, in an auto-shrinking font (`zoneAnswerFontSize`), or the
   * `zoneEmpty` placeholder — instead of an inline input/select, and
   * tapping one calls this instead of focusing a field. The caller (the
   * practice page's mobile viewer) owns the actual input inside its own
   * bottom sheet. Omitted keeps every existing caller (creator preview,
   * moderation preview, desktop practice) pixel-identical to before.
   */
  onZoneTap?: (zoneId: string) => void;
  /** The zone currently open in the caller's bottom sheet, for the tap target's highlight ring. Ignored without `onZoneTap`. */
  activeZoneId?: string | null;
}

export default function WorksheetPlayer({
  lang,
  image,
  zones,
  imageUrl,
  rotation = 0,
  practice,
  onZoneTap,
  activeZoneId,
}: WorksheetPlayerProps) {
  const t = UI_LABELS[lang].activities.player;
  const containerRef = useRef<HTMLDivElement>(null);
  // Only needed for a 90/270 rotation, where the pre-rotation image box must
  // be TRANSPOSED relative to the (now-swapped) container — a relation plain
  // CSS percentages cannot express in a fluid/responsive layout, so this is
  // measured directly (mirroring the editor's own `getBoundingClientRect`-driven
  // canvas sizing). A 0/180 rotation never swaps the aspect ratio, so it stays
  // pure CSS (`inset-0 h-full w-full object-contain` + a same-size `rotate()`)
  // and never depends on this measurement.
  const [containerWidth, setContainerWidth] = useState(0);
  const isQuarterTurn = rotation === 90 || rotation === 270;

  useEffect(() => {
    if (!isQuarterTurn) return undefined;
    const el = containerRef.current;
    if (!el) return undefined;
    function measure() {
      setContainerWidth(el!.getBoundingClientRect().width);
    }
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isQuarterTurn]);

  const displaySize = rotatedSize(image, rotation);
  // Pre-rotation box: after rotating 90/270 its bounding box swaps back to
  // exactly (containerWidth, containerHeight) IF its own aspect ratio is the
  // image's natural one — see WorksheetZoneEditor's identical derivation.
  const rotatedImageStyle = isQuarterTurn
    ? {
        position: 'absolute' as const,
        top: '50%',
        left: '50%',
        height: containerWidth,
        width: containerWidth * (image.width / image.height),
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        maxWidth: 'none',
      }
    : {
        transform: `rotate(${rotation}deg)`,
      };

  return (
    <div data-testid="worksheet-player" className="w-full">
      {!practice && <p className="mb-2 text-xs text-muted-foreground">{t.notGraded}</p>}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-lg bg-muted"
        style={{ aspectRatio: `${displaySize.width} / ${displaySize.height}` }}
      >
        <img
          src={imageUrl}
          alt=""
          className={isQuarterTurn ? 'object-contain' : 'absolute inset-0 h-full w-full object-contain'}
          style={rotatedImageStyle}
        />
        {zones.map((zone) => {
          const style = {
            left: `${zone.x * 100}%`,
            top: `${zone.y * 100}%`,
            width: `${zone.w * 100}%`,
            height: `${zone.h * 100}%`,
          };

          // Present only once `practice.results` exists AND names this
          // zone — a zone the caller's grading pass could not reach for
          // some reason stays neither-green-nor-red rather than defaulting
          // to either color.
          const isGraded = practice?.results !== undefined && zone.id in practice.results;
          const isCorrect = isGraded ? practice!.results![zone.id] : undefined;
          const gradedClassName = isGraded
            ? isCorrect
              ? 'border-emerald-500 ring-2 ring-emerald-500/50'
              : 'border-destructive ring-2 ring-destructive/50'
            : 'border-border';
          const fieldClassName = `h-full w-full rounded border bg-background/95 px-1 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${gradedClassName}`;
          const statusLabel = isGraded ? (isCorrect ? t.correct : t.incorrect) : undefined;

          // Mobile layout pass: a tap target instead of an inline input —
          // see `onZoneTap`'s own doc on `WorksheetPlayerProps`.
          if (onZoneTap) {
            const value = practice?.values[zone.id] ?? '';
            const displayText = value || t.zoneEmpty;
            const isActive = activeZoneId === zone.id;
            const kindLabel = zone.kind === 'text' ? t.textPlaceholder : t.choicePlaceholder;
            const accessibleLabel = [kindLabel, value || t.zoneEmpty, statusLabel].filter(Boolean).join(' — ');

            return (
              <div key={zone.id} data-testid={`player-zone-${zone.id}`} className="absolute" style={style}>
                <button
                  type="button"
                  data-testid={`player-zone-tap-${zone.id}`}
                  onClick={() => onZoneTap(zone.id)}
                  disabled={practice?.disabled}
                  aria-label={accessibleLabel}
                  aria-pressed={isActive}
                  className={cn(
                    'flex h-full w-full items-center justify-center overflow-hidden rounded border bg-background/95 px-1 text-center text-foreground shadow-sm',
                    gradedClassName,
                    isActive && 'ring-2 ring-primary',
                    !value && 'text-muted-foreground',
                  )}
                  style={{ fontSize: `${zoneAnswerFontSize(displayText)}rem` }}
                >
                  <span className="truncate">{displayText}</span>
                </button>
                {statusLabel && (
                  <span data-testid={`player-zone-result-${zone.id}`} className="sr-only">
                    {statusLabel}
                  </span>
                )}
              </div>
            );
          }

          return (
            <div key={zone.id} data-testid={`player-zone-${zone.id}`} className="absolute" style={style}>
              {zone.kind === 'text' ? (
                <input
                  type="text"
                  aria-label={statusLabel ? `${t.textPlaceholder} — ${statusLabel}` : t.textPlaceholder}
                  placeholder={t.textPlaceholder}
                  className={fieldClassName}
                  {...(practice
                    ? {
                        value: practice.values[zone.id] ?? '',
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                          practice.onChange(zone.id, e.target.value),
                        disabled: practice.disabled,
                      }
                    : {})}
                />
              ) : (
                <select
                  aria-label={statusLabel ? `${t.choicePlaceholder} — ${statusLabel}` : t.choicePlaceholder}
                  className={fieldClassName}
                  {...(practice
                    ? {
                        value: practice.values[zone.id] ?? '',
                        onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                          practice.onChange(zone.id, e.target.value),
                        disabled: practice.disabled,
                      }
                    : { defaultValue: '' })}
                >
                  <option value="" disabled>
                    {t.choicePlaceholder}
                  </option>
                  {(zone.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}
              {statusLabel && (
                <span data-testid={`player-zone-result-${zone.id}`} className="sr-only">
                  {statusLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
