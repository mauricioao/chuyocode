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
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { WhatsappLogoIcon } from '@phosphor-icons/react/dist/ssr/WhatsappLogo';
import { QrCodeIcon } from '@phosphor-icons/react/dist/ssr/QrCode';
import { ShareNetworkIcon } from '@phosphor-icons/react/dist/ssr/ShareNetwork';
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
  /** Toast shown after a successful clipboard copy (PR 1 — sonner). */
  linkCopiedToast: string;
  /** Accessible name for the code itself — it is an image, not decoration. */
  qrAlt: string;
  /** The WhatsApp share button, rendered only when {@link ShareDialogProps.whatsappHref} is set. */
  whatsapp?: string;
  /** "Descargar QR" — the code as a standalone file, rendered only when {@link ShareDialogProps.downloadFileName} is set. */
  downloadQr?: string;
  /** The native share-sheet button (`navigator.share`), rendered only when it actually exists on the device. */
  native?: string;
  /** A short muted line under the dialog's content — e.g. "sign-in required" — omitted entirely when absent. */
  note?: string;
}

export interface ShareDialogProps {
  /** Canonical absolute URL, derived from the request (see `shareUrl`). */
  url: string;
  /** Server-rendered QR markup for {@link url}. */
  qr: string;
  labels: ShareLabels;
  /**
   * `https://wa.me/?text=…`, built server-side (title + url, already
   * encoded) — activities-only (D8); omitted entirely, this dialog behaves
   * exactly as it did before the WhatsApp/QR-download/native-share
   * additions.
   */
  whatsappHref?: string;
  /**
   * The filename the QR download gets (e.g. `actividad.svg`). Its PRESENCE,
   * not `labels.downloadQr`, is what decides whether the download button
   * renders — a filename with no label would be a silent no-op button.
   */
  downloadFileName?: string;
}

/**
 * Share actions read as a row of colored icon tiles with a caption underneath
 * (the iOS share-sheet pattern): the brand color makes WhatsApp recognizable at
 * a glance, the caption says what each one does.
 */
const SHARE_ACTION_CLASS =
  'group flex w-20 flex-col items-center gap-2 rounded-xl p-1 text-center outline-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0';
const SHARE_CAPTION_CLASS = 'text-xs leading-tight text-muted-foreground group-hover:text-foreground';

function ShareActionIcon({
  kind,
  className,
  children,
}: {
  kind: 'whatsapp' | 'qr' | 'native';
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      data-share-icon={kind}
      className={`flex size-12 items-center justify-center rounded-full shadow-md transition-shadow group-hover:shadow-lg ${className}`}
    >
      {children}
    </span>
  );
}

export default function ShareDialog({ url, qr, labels, whatsappHref, downloadFileName }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const [canCopy, setCanCopy] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  // Detected in an effect rather than during render because this component is
  // ALSO server-rendered by Astro, where `navigator` does not exist. Reading it
  // during render would either throw on the server or produce markup that
  // disagrees with the client's first paint.
  useEffect(() => {
    setCanCopy(typeof navigator?.clipboard?.writeText === 'function');
    setCanNativeShare(typeof navigator?.share === 'function');
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
      toast.success(labels.linkCopiedToast);
    } catch {
      // Denied permission, or a context where the API exists but refuses. The
      // button simply does not claim success — and the URL beside it is still
      // selectable text, which is the fallback that always works.
    }
  }

  /**
   * The device's own share sheet, when one exists. `navigator.share` throws
   * on a user-cancelled sheet (`AbortError`) — that is not a failure, just
   * the person changing their mind, so it is swallowed the same way `copy`
   * swallows a denied clipboard permission.
   */
  async function nativeShare() {
    try {
      await navigator.share({ title: labels.title, url });
    } catch {
      // Cancelled, or unsupported despite the feature check above (a device
      // quirk) — either way, nothing else on the dialog depends on this.
    }
  }

  /**
   * The QR as its own downloadable `.svg` file — "PNG or SVG" per the task;
   * SVG needs no canvas round trip and the markup is already in hand. A
   * throwaway `<a download>` click is the standard trigger-a-download idiom
   * with no extra dependency.
   */
  function downloadQr() {
    if (!downloadFileName) return;
    const blob = new Blob([qr], { type: 'image/svg+xml' });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = downloadFileName;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
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

        {/* WhatsApp / download-QR / native-share row (D8, activities only —
            each control renders only when the prop/feature that backs it is
            actually present, same "no dead button" posture as the copy
            button above). */}
        {(whatsappHref || downloadFileName || canNativeShare) && (
          <div className="flex flex-wrap justify-center gap-6">
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={labels.whatsapp}
                data-testid="exercise-share-whatsapp"
                className={SHARE_ACTION_CLASS}
              >
                <ShareActionIcon kind="whatsapp" className="bg-[#25D366] text-white">
                  <WhatsappLogoIcon weight="fill" className="size-6" aria-hidden="true" />
                </ShareActionIcon>
                <span className={SHARE_CAPTION_CLASS}>{labels.whatsapp}</span>
              </a>
            )}
            {downloadFileName && (
              <button
                type="button"
                onClick={downloadQr}
                aria-label={labels.downloadQr}
                data-testid="exercise-share-download"
                className={SHARE_ACTION_CLASS}
              >
                <ShareActionIcon kind="qr" className="bg-accent text-black">
                  <QrCodeIcon weight="bold" className="size-6" aria-hidden="true" />
                </ShareActionIcon>
                <span className={SHARE_CAPTION_CLASS}>{labels.downloadQr}</span>
              </button>
            )}
            {canNativeShare && (
              <button
                type="button"
                onClick={() => void nativeShare()}
                aria-label={labels.native}
                data-testid="exercise-share-native"
                className={SHARE_ACTION_CLASS}
              >
                <ShareActionIcon kind="native" className="bg-sky-500 text-white">
                  <ShareNetworkIcon weight="bold" className="size-6" aria-hidden="true" />
                </ShareActionIcon>
                <span className={SHARE_CAPTION_CLASS}>{labels.native}</span>
              </button>
            )}
          </div>
        )}

        {/* A short muted line — e.g. "sign-in required" for a gated section
            (D8) — omitted entirely when the caller has none to show. */}
        {labels.note && (
          <p data-testid="exercise-share-note" className="text-xs text-muted-foreground">
            {labels.note}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
