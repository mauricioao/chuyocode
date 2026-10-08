/**
 * AudioMarkerButton — the round ▶/⏸ affordance one worksheet audio marker
 * renders as, shared by the practice player, the presentation overview
 * slide, and the editor's own canvas (`WorksheetZoneEditor.tsx`, where it is
 * ALSO the drag handle — see that file's own header). Pure presentation: no
 * fetch, no `<audio>` element of its own — the caller supplies `playing`
 * and `onToggle` (from `useAudioMarkerPlayback`, or the editor's own
 * pointer/selection handlers).
 *
 * Centered on its own fractional `x`/`y` point (unlike a {@link
 * import('@/lib/activities/blocks').Zone}, a marker has no `w`/`h` — it is
 * always this one fixed size), large enough for a comfortable touch target
 * (44px).
 */
import { PlayIcon } from '@phosphor-icons/react/dist/ssr/Play';
import { PauseIcon } from '@phosphor-icons/react/dist/ssr/Pause';
import { cn } from '@/lib/utils';

export interface AudioMarkerButtonProps {
  x: number;
  y: number;
  playing: boolean;
  label: string;
  onToggle?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  'data-testid'?: string;
  className?: string;
  /** Disables the button's own pointer handling (editor canvas, outside the Audio tool) — rendered as a plain inert visual marker. Defaults to `false`. */
  inert?: boolean;
  /** Editor-only selection ring — independent of `playing` (which is always `false` on the canvas: the editor's own listen-back lives in the properties panel, not this button). Defaults to `false`. */
  selected?: boolean;
}

export default function AudioMarkerButton({
  x,
  y,
  playing,
  label,
  onToggle,
  onPointerDown,
  'data-testid': testId,
  className,
  inert = false,
  selected = false,
}: AudioMarkerButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={playing}
      tabIndex={inert ? -1 : 0}
      disabled={inert}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      onPointerDown={onPointerDown}
      data-testid={testId}
      className={cn(
        'absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary-foreground bg-primary text-primary-foreground shadow-elevation-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        inert ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer',
        selected && 'ring-4 ring-accent-ink',
        className,
      )}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    >
      {playing ? <PauseIcon aria-hidden="true" weight="fill" /> : <PlayIcon aria-hidden="true" weight="fill" />}
    </button>
  );
}
