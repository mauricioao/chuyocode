/**
 * DuplicateActivityButton — "Duplicar" in the practice page's header
 * (`/[lang]/ingles/actividades/[id]`, D7 "Duplicar y adaptar"). Mounted for
 * EVERY signed-in visitor, including the activity's own author — unlike
 * `HeartButton`/`ReportActivityButton`, which the page hides for the author
 * — because duplicating one's own activity is a legitimate way to branch off
 * a variant. `POST /api/actividades/[id]/duplicar` refuses an anonymous
 * caller server-side too (`duplicar.ts`'s own header); the page's own gate
 * (this whole route is sign-in gated already) means an anonymous visitor
 * never reaches this component in practice.
 *
 * ONE ACTION, no dialog: click -> POST -> on success, navigate straight to
 * the new draft's editor (`/[lang]/crear/[id]`) — there is nothing to
 * configure first, unlike `ReportActivityButton`'s reason picker. A failure
 * surfaces inline, next to the button, via `aria-live` so it is announced
 * without stealing focus.
 */
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { CopySimpleIcon } from '@phosphor-icons/react/dist/ssr/CopySimple';
import { SpinnerGapIcon } from '@phosphor-icons/react/dist/ssr/SpinnerGap';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { ICON_TOOLTIP_BUBBLE_CLASS, ICON_TOOLTIP_TRIGGER_CLASS } from '@/lib/ui/iconTooltip';
import { isEmbeddedWindowDom, postDeskWindowMessage } from '@/lib/ui/deskWindowMessaging';

export interface DuplicateActivityButtonProps {
  lang: Lang;
  activityId: string;
  /** Injectable for tests, same pattern as `ActivityStartIsland`'s own `navigate` prop. */
  navigate?: (url: string) => void;
}

type Status = 'idle' | 'duplicating' | 'error';

/**
 * Window-manager architecture: embedded (the practice window is itself an
 * iframe — `@lib/ui/embeddedWindow`'s own header), a plain in-window
 * navigation would REPLACE the practice window with the new draft's editor
 * — owner spec instead wants the editor to open as its OWN new window,
 * stacked over the practice window, exactly like any other
 * `[data-desk-open-window]` link. `title: null` — the host shows a generic
 * placeholder until the editor's own `deskWindow.ts` posts its real title on
 * mount, same as every other freshly-opened window with no known title yet.
 */
function defaultNavigate(url: string): void {
  if (isEmbeddedWindowDom(document)) {
    postDeskWindowMessage(window, { type: 'open-window', href: url, title: null });
    return;
  }
  window.location.href = url;
}

export default function DuplicateActivityButton({
  lang,
  activityId,
  navigate = defaultNavigate,
}: DuplicateActivityButtonProps) {
  const t = UI_LABELS[lang].activities.practice;
  const [status, setStatus] = useState<Status>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const tooltipId = useId();
  const label = status === 'duplicating' ? t.duplicating : t.duplicate;

  async function duplicate() {
    if (status === 'duplicating') return;
    setStatus('duplicating');
    setErrorKey(null);
    try {
      const res = await fetch(`/api/actividades/${activityId}/duplicar`, { method: 'POST' });
      const body: { id?: unknown; error?: unknown } = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.id !== 'string') {
        setErrorKey(typeof body.error === 'string' ? body.error : 'create_failed');
        setStatus('error');
        return;
      }
      toast.success(UI_LABELS[lang].common.toast.activityDuplicated);
      navigate(`/${lang}/crear/${body.id}`);
    } catch {
      setErrorKey('create_failed');
      setStatus('error');
    }
  }

  const errors = t.duplicateErrors as Record<string, string>;
  const errorMessage = errorKey ? (errors[errorKey] ?? t.duplicateErrors.create_failed) : null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        data-testid="duplicate-activity-button"
        onClick={() => void duplicate()}
        aria-disabled={status === 'duplicating'}
        aria-busy={status === 'duplicating'}
        aria-label={label}
        aria-describedby={tooltipId}
        className={ICON_TOOLTIP_TRIGGER_CLASS}
      >
        {status === 'duplicating' ? (
          <SpinnerGapIcon aria-hidden="true" size={16} className="animate-spin" />
        ) : (
          <CopySimpleIcon aria-hidden="true" size={16} />
        )}
        <span role="tooltip" id={tooltipId} className={ICON_TOOLTIP_BUBBLE_CLASS}>
          {label}
        </span>
      </button>
      {errorMessage && (
        <p role="alert" data-testid="duplicate-activity-error" className="text-xs text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
