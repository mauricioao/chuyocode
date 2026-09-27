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
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { ImageRef, Zone } from '@/lib/activities/blocks';

export interface WorksheetPlayerProps {
  lang: Lang;
  image: ImageRef;
  zones: Zone[];
  /** Resolved, browser-loadable URL for `image.path` (caller resolves it). */
  imageUrl: string;
}

export default function WorksheetPlayer({ lang, image, zones, imageUrl }: WorksheetPlayerProps) {
  const t = UI_LABELS[lang].activities.player;

  return (
    <div data-testid="worksheet-player" className="w-full">
      <p className="mb-2 text-xs text-muted-foreground">{t.notGraded}</p>
      <div
        className="relative w-full overflow-hidden rounded-lg bg-muted"
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
      >
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
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
