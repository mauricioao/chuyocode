/**
 * ShareDialog — the QR + link a teacher projects so a room can open the exercise.
 *
 * THE USE CASE IS THE DESIGN. An exercise is projected; thirty phones need to
 * reach it. Typing a deep link off a screen is error-prone and slow, so the QR
 * is the primary affordance. But a QR is USELESS ON THE DEVICE ALREADY SHOWING
 * IT — the person who opened this dialog cannot scan their own screen — so the
 * URL is also present as ordinary selectable text, with a copy button beside it.
 * Those are two different audiences for one dialog, not redundancy.
 *
 * ITS OWN ISLAND, separate from both `ExerciseIsland` and `LikeButton`. It is
 * the heaviest of the three (Radix Dialog brings a portal, a focus trap and
 * scroll locking) and the least urgent, which is exactly the combination that
 * should not sit on the exercise's hydration path.
 *
 * IT OWNS NO VOCABULARY — the page resolves every string from `UI_LABELS` and
 * passes them in (RULE 1). A local copy map here would sit outside the reach of
 * the site-wide neutral-Spanish guard.
 *
 * THE QR IS BUILT ON THE SERVER (`src/lib/qr.ts`) and arrives as markup. No
 * third-party image service is involved — that would leak every shared URL to a
 * company with no relationship to this site and make the dialog depend on their
 * uptime.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/**
 * The lucide `Share` paths, at their 24px viewBox.
 *
 * ICONS ARE DATA (the standing rule behind `skillIcons.ts` and
 * `arrowControl.ts`). Copied VERBATIM from
 * `node_modules/lucide-react/dist/esm/icons/share.mjs`, lucide-react v1.27.0,
 * ISC licensed. `share` is used rather than `share-2` because `share-2` is drawn
 * from `<circle>` and `<line>` nodes, which a flat list of `d` strings cannot
 * represent faithfully.
 *
 * TRADEOFF: copied geometry does not follow a `lucide-react` upgrade. Same
 * accepted risk as `skillIcons.ts`.
 */
const SHARE_PATHS = ['M12 2v13', 'm16 6-4-4-4 4', 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'];

/** How long the button reads "copied" before returning to its normal label. */
export const COPIED_RESET_MS = 2000;

/** Every string this dialog renders, resolved from `UI_LABELS` by the page. */
export interface ShareLabels {
  /** The control that opens the dialog. */
  trigger: string;
  title: string;
  /** What to do with the code. */
  hint: string;
  /** Names the URL region for assistive tech. */
  link: string;
  copy: string;
  copied: string;
  /** Accessible name for the code itself — it is an image, not decoration. */
  qrAlt: string;
}

export interface ShareDialogProps {
  /** Canonical absolute URL, derived from the request (see `shareUrl`). */
  url: string;
  /** Server-rendered QR markup for {@link url}. */
  qr: string;
  labels: ShareLabels;
}

export default function ShareDialog({ url, qr, labels }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const [canCopy, setCanCopy] = useState(false);

  // Detected in an effect rather than during render because this component is
  // ALSO server-rendered by Astro, where `navigator` does not exist. Reading it
  // during render would either throw on the server or produce markup that
  // disagrees with the client's first paint.
  useEffect(() => {
    setCanCopy(typeof navigator?.clipboard?.writeText === 'function');
  }, []);

  // "Copied" is a transient acknowledgement, not a state the dialog stays in.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Denied permission, or a context where the API exists but refuses. The
      // button simply does not claim success — and the URL beside it is still
      // selectable text, which is the fallback that always works.
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-testid="exercise-share">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {SHARE_PATHS.map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
          {labels.trigger}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.hint}</DialogDescription>
        </DialogHeader>

        {/* THE CODE.
            `role="img"` + `aria-label` because the QR carries meaning and the
            inlined `<svg>` has no accessible name of its own — without this a
            screen reader announces a wall of nothing.

            Capped at 15rem so it fits inside the 288px of content a 320px
            viewport leaves, and centred rather than stretched: a QR blown up to
            fill a phone screen is not easier to scan, it is just larger.

            The code paints its own WHITE background including the quiet zone
            (see `QR_OPTIONS`), which is why it can sit on this dark surface at
            all — a QR in theme colours is a QR scanners reject. */}
        <div
          role="img"
          aria-label={labels.qrAlt}
          data-testid="exercise-qr"
          className="mx-auto w-full max-w-[15rem] rounded-lg [&>svg]:h-auto [&>svg]:w-full"
          // The markup is machine-generated on the server by `qrSvg`, which
          // encodes its input into a matrix of `<path>` coordinates — the URL is
          // never interpolated into the markup, so there is no injection path
          // through it. The alternative (re-deriving the path data in JSX) would
          // reimplement the renderer to reach the identical output.
          dangerouslySetInnerHTML={{ __html: qr }}
        />

        {/* THE SAME LINK AS TEXT — the reason the dialog is useful to the person
            who opened it, who cannot scan their own screen.

            `break-all` is load-bearing: an exercise URL is one long unbroken
            token, and without it the dialog scrolls sideways at 320px. */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {labels.link}
          </span>
          <code className="break-all rounded-md bg-muted px-2 py-1.5 text-xs">
            {url}
          </code>
          {/* Rendered only where the clipboard API actually exists. A button
              that silently does nothing is worse than no button — and the
              selectable text above already covers that case. */}
          {canCopy && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={copy}
              className="self-end"
              data-testid="exercise-share-copy"
            >
              {copied ? labels.copied : labels.copy}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
