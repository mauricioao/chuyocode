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
 *
 * CLEAN ZONES (practice player redesign): the container's own rendered pixel
 * box is measured unconditionally (not just for a 90/270 rotation — see
 * `containerSize` below), so each zone's inline input can size its own font
 * to the zone's ACTUAL rendered height (`zoneInputFontSizePx`) and hide its
 * placeholder copy entirely once the zone is too narrow to show it without
 * clipping (`shouldShowZonePlaceholder`) — both pure helpers in
 * `zoneAnswerDisplay.ts`. The speaker corner badge (D4) is hidden by default
 * and shown only on hover/focus of the zone (`group`/`group-focus-within`),
 * or whenever the zone's own input/select is itself focused.
 */
import { useEffect, useRef, useState } from 'react';
import { LightbulbIcon } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { ImageBrokenIcon } from '@phosphor-icons/react/dist/ssr/ImageBroken';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import SpeakButton from '@/lib/speech/SpeakButton';
import type { ImageRef, Rotation, Zone } from '@/lib/activities/blocks';
import { rotatedSize } from '@/lib/activities/canvasViewport';
import {
  zoneAnswerFontSize,
  zoneInputFontSizePx,
  shouldShowZonePlaceholder,
} from '@/lib/activities/zoneAnswerDisplay';
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
  // Clean zones (practice player redesign): the container's rendered
  // HEIGHT, measured unconditionally (not just for a quarter-turn rotation —
  // see the file header) so each zone's own pixel height can be derived
  // below regardless of rotation.
  const [containerHeight, setContainerHeight] = useState(0);
  const isQuarterTurn = rotation === 90 || rotation === 270;
  // D5 "¿Por qué?": which zone's explanation popover the learner explicitly
  // clicked open — hover/focus reveal it too, but purely via CSS
  // (`group-hover`/`group-focus-within`, same mechanism the speak badge
  // already uses), so this state only needs to cover the click case (the
  // task's third trigger, load-bearing on touch devices with no real hover).
  const [openExplanationId, setOpenExplanationId] = useState<string | null>(null);

  // Coherent loading states, item 6 — see WorksheetZoneEditor's identical
  // treatment for the editor's own canvas: a soft fade-in once the image
  // decodes (the container's `bg-muted` already reads as a loading
  // surface), and a neutral broken-image placeholder instead of the
  // browser's own glyph on failure. Purely cosmetic — zones are positioned
  // against the CONTAINER, not the image itself, so this never touches
  // their math.
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  useEffect(() => {
    setImageLoaded(false);
    setImageBroken(false);
  }, [imageUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    function measure() {
      const box = el!.getBoundingClientRect();
      setContainerWidth(box.width);
      setContainerHeight(box.height);
    }
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
        // Visual-theme pass: a warm, subtle shadow + hairline border so the
        // sheet reads as a distinct surface on the light Inglés canvas (same
        // `bg-muted` cream `.canvas-dots` uses) — both restate their current
        // dark values in `[data-theme="brand"]`/default, so this is a no-op
        // on dark.
        className="relative w-full overflow-hidden rounded-lg border border-(--color-field-border) bg-muted shadow-elevation-1"
        style={{ aspectRatio: `${displaySize.width} / ${displaySize.height}` }}
      >
        {imageBroken ? (
          <div
            data-testid="worksheet-player-image-broken"
            className="absolute inset-0 flex items-center justify-center text-muted-foreground"
          >
            <ImageBrokenIcon aria-hidden="true" size={32} />
          </div>
        ) : (
          <img
            src={imageUrl}
            alt=""
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageBroken(true)}
            className={cn(
              isQuarterTurn ? 'object-contain' : 'absolute inset-0 h-full w-full object-contain',
              'transition-opacity duration-300 motion-reduce:transition-none',
              imageLoaded ? 'opacity-100' : 'opacity-0',
            )}
            style={rotatedImageStyle}
          />
        )}
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
              ? 'border-success-strong ring-2 ring-success-strong/50'
              : 'border-destructive ring-2 ring-destructive/50'
            : 'border-border';
          const statusLabel = isGraded ? (isCorrect ? t.correct : t.incorrect) : undefined;

          // Clean zones (practice player redesign): the zone's own rendered
          // pixel box (from the container's measured size — see the file
          // header) drives the inline input's font size and whether it shows
          // placeholder copy at all, instead of a fixed `text-xs` and an
          // always-on placeholder that can overflow/clip a small zone.
          const zoneWidthPx = zone.w * containerWidth;
          const zoneHeightPx = zone.h * containerHeight;
          const showPlaceholder = shouldShowZonePlaceholder(zoneWidthPx);
          const inputFontSize = zoneInputFontSizePx(zoneHeightPx);
          const fieldClassName = cn(
            'h-full w-full rounded border bg-background/95 px-1 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            gradedClassName,
            !showPlaceholder && 'border-dashed',
          );

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
                  // NOT disabled once graded (D5, "¿Por qué?"): the tap
                  // target must stay reachable so the learner can still open
                  // the sheet to REVIEW an incorrect zone's explanation —
                  // what actually locks the answer is the sheet's own
                  // input/option buttons (`practice.disabled`, passed
                  // straight through by `WorksheetPracticePlayerMobile`),
                  // not this outer tap target.
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
            <div
              key={zone.id}
              data-testid={`player-zone-${zone.id}`}
              // `group`/`focus-within`: the speaker corner badge below stays
              // hidden until this zone is hovered OR its own input/select is
              // focused — see the file header's "Clean zones".
              className="group absolute"
              style={style}
            >
              {zone.kind === 'text' ? (
                <input
                  type="text"
                  aria-label={statusLabel ? `${t.textPlaceholder} — ${statusLabel}` : t.textPlaceholder}
                  placeholder={showPlaceholder ? t.textPlaceholder : undefined}
                  className={fieldClassName}
                  style={{ fontSize: `${inputFontSize}px` }}
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
                  style={{ fontSize: `${inputFontSize}px` }}
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
              {/* D4 "Escuchar/Listen": a small speaker affordance for a zone
                  the author gave text to — a worksheet is an uploaded image
                  with no machine-readable text otherwise. Same in the
                  editor's own preview mode (`practice` omitted) and the real
                  practice player. A corner badge rather than inline: the
                  zone box is sized to the drawn rectangle, often far too
                  small to fit a button beside its input.
                  CLEAN ZONES: a ~18px visual badge with a larger 32px hit
                  area (`h-8 w-8`), hidden by default and shown only on
                  hover/focus of the zone (`group-hover`/`group-focus-within`
                  — the wrapper above carries `group`), rather than always-on
                  clutter over the artwork. */}
              {zone.speak && (
                <div
                  data-testid={`player-zone-speak-${zone.id}`}
                  className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-card opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <SpeakButton text={zone.speak} lang={lang} compact />
                </div>
              )}
              {/* D5 "¿Por qué?": only once graded AND only for THIS zone's
                  own incorrect verdict — never before checking, never for a
                  correct answer. Opposite corner from the speak badge above
                  so the two never overlap on a zone that has both. The
                  popover is a plain descendant of this zone's own `group`
                  wrapper, so it reveals via hover/focus exactly like the
                  speak badge (pure CSS, `group-hover`/`group-focus-within`);
                  `openExplanationId` only adds the click trigger on top. */}
              {zone.explanation && isGraded && isCorrect === false && (
                <div data-testid={`player-zone-explanation-${zone.id}`} className="absolute -left-3 -top-3 z-10">
                  <button
                    type="button"
                    data-testid={`player-zone-explanation-button-${zone.id}`}
                    aria-label={t.explanationButtonLabel}
                    aria-describedby={`zone-explanation-${zone.id}`}
                    aria-expanded={openExplanationId === zone.id}
                    onClick={() =>
                      setOpenExplanationId((prev) => (prev === zone.id ? null : zone.id))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-hint shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <LightbulbIcon aria-hidden="true" weight="fill" />
                  </button>
                  <div
                    id={`zone-explanation-${zone.id}`}
                    role="note"
                    data-testid={`player-zone-explanation-popover-${zone.id}`}
                    className={cn(
                      'pointer-events-none absolute left-0 top-full z-20 mt-1 w-48 rounded-md border border-border bg-card p-2 text-xs text-foreground opacity-0 shadow-md transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
                      openExplanationId === zone.id && 'pointer-events-auto opacity-100',
                    )}
                  >
                    {zone.explanation}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
