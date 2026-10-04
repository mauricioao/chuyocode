'use client';

/**
 * DeleteAccountDialog — the "Eliminar mi cuenta" destructive flow inside
 * `UserMenu`'s signed-in dropdown AND its mobile-portal twin (owner
 * decision, 2026-10-04). Rendered TWICE by `UserMenu` — once per
 * breakpoint, each its own independent instance — the exact same
 * duplication that component's own sign-out `<form>` already uses, rather
 * than a single shared dialog instance with two remote triggers.
 *
 * `renderTrigger` lets each call site supply its own trigger markup
 * (dropdown `role="menuitem"` button vs the mobile panel's plain
 * link-styled button) while keeping the dialog's own copy, validation and
 * request logic in exactly one place. This is an ordinary React prop
 * between two components inside the SAME already-hydrated island
 * (`UserMenu`), not an Astro -> React boundary, so a function prop here is
 * fine — the "no function props to islands" guard is about THAT boundary.
 *
 * Destructive-action contract: the confirm button stays disabled until the
 * typed word matches `labels.deleteAccountConfirmWord` EXACTLY (ELIMINAR in
 * es, DELETE in en). This is a client-side convenience only —
 * `POST /api/cuenta/eliminar` re-validates the same word server-side and is
 * the actual authority (never trust the body for a destructive action).
 *
 * On success: clear the `/api/me` cache (so the destination page's own
 * `UserMenu` never flashes a stale signed-in avatar — the account's own
 * session is already gone server-side at this point), stash the success
 * toast for the NEXT page via `writePendingToast` (this page is about to be
 * torn down by the navigation below, so a toast fired here would never be
 * seen — see `@/lib/pendingToast`'s own header), and hard-navigate home
 * (`window.location.assign`, the same idiom `PasswordAuthForm`/
 * `ActivityStartIsland` already use after a server-mutated identity).
 *
 * On failure: show the generic error and leave the dialog open with the
 * caller still signed in — not just UI framing; the account genuinely is
 * untouched (`src/lib/accountDeletion.ts`'s own contract: nothing before a
 * full success mutates the session).
 */
import { useState } from 'react';
import { UI_LABELS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { clearMeCache } from '@/lib/meCache';
import { writePendingToast } from '@/lib/pendingToast';

type UserMenuLabels = Record<keyof (typeof UI_LABELS)['es']['auth']['userMenu'], string>;

export interface DeleteAccountDialogProps {
  /**
   * Active locale, used only to build the post-deletion redirect
   * (`/${lang}/`). Plain `string`, not the stricter `Lang` union — same
   * choice `UserMenu`'s own `lang` prop makes, since this component never
   * indexes `UI_LABELS` with it (`labels` already carries the resolved
   * copy).
   */
  lang: string;
  /** Same slice `Header.astro` already computes for `UserMenu` itself — see that component's own props doc. */
  labels: UserMenuLabels;
  /** Renders this call site's own trigger element, given the click handler that opens the dialog. */
  renderTrigger: (onClick: () => void) => React.ReactNode;
}

type Status = 'idle' | 'submitting' | 'error';

export default function DeleteAccountDialog({ lang, labels: t, renderTrigger }: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  function openDialog() {
    setTyped('');
    setStatus('idle');
    setOpen(true);
  }

  function close() {
    if (status === 'submitting') return;
    setOpen(false);
  }

  async function submit() {
    if (typed !== t.deleteAccountConfirmWord || status === 'submitting') return;
    setStatus('submitting');
    try {
      const res = await fetch('/api/cuenta/eliminar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      clearMeCache();
      writePendingToast(t.deleteAccountSuccessToast);
      window.location.assign(`/${lang}/`);
    } catch {
      setStatus('error');
    }
  }

  return (
    <>
      {renderTrigger(openDialog)}

      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent data-testid="delete-account-dialog">
          <DialogHeader>
            <DialogTitle>{t.deleteAccountDialogTitle}</DialogTitle>
            <DialogDescription>{t.deleteAccountDialogBody}</DialogDescription>
          </DialogHeader>

          <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
            <span>{t.deleteAccountConfirmLabel}</span>
            <Input
              data-testid="delete-account-confirm-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t.deleteAccountConfirmWord}
              autoComplete="off"
              disabled={status === 'submitting'}
            />
          </label>

          {status === 'error' && (
            <p data-testid="delete-account-error" className="text-sm text-destructive">
              {t.deleteAccountErrorGeneric}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              data-testid="delete-account-cancel"
              onClick={close}
              disabled={status === 'submitting'}
            >
              {t.deleteAccountCancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="delete-account-confirm"
              disabled={typed !== t.deleteAccountConfirmWord || status === 'submitting'}
              loading={status === 'submitting'}
              onClick={() => void submit()}
            >
              {t.deleteAccountButton}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
