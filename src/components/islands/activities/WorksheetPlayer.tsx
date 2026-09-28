/**
 * WorksheetPlayer — renders a worksheet block the way a LEARNER sees it:
 * the image, with one input/select positioned over each zone, NOT GRADED
 * (PR B, "Activities creator" — the editor's own preview mode). Kept as its
 * own component, separate from the editor, so PR D's real player can mount
 * it unchanged against a published revision's blocks.
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

export interface WorksheetPlayerProps {
  lang: Lang;
  image: ImageRef;
  zones: Zone[];
  /** Resolved, browser-loadable URL for `image.path` (caller resolves it). */
  imageUrl: string;
  /** The worksheet's own rotation (creator polish round 2) — rendered here exactly like the editor. */
  rotation?: Rotation;
}

export default function WorksheetPlayer({ lang, image, zones, imageUrl, rotation = 0 }: WorksheetPlayerProps) {
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
      <p className="mb-2 text-xs text-muted-foreground">{t.notGraded}</p>
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
          return (
            <div key={zone.id} data-testid={`player-zone-${zone.id}`} className="absolute" style={style}>
              {zone.kind === 'text' ? (
                <input
                  type="text"
                  aria-label={t.textPlaceholder}
                  placeholder={t.textPlaceholder}
                  className="h-full w-full rounded border border-border bg-background/95 px-1 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              ) : (
                <select
                  aria-label={t.choicePlaceholder}
                  defaultValue=""
                  className="h-full w-full rounded border border-border bg-background/95 px-1 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
