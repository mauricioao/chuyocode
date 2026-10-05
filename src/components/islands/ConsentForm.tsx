/**
 * ConsentForm — the standalone consent screen's form (Login step 2, Ley N°
 * 29733). The one island `src/pages/[lang]/auth/consentimiento.astro`
 * mounts: the checkbox + sentence from `AgeConsentCheckbox`, a "Continuar"
 * button, and the `POST /api/auth/consentimiento` round trip.
 *
 * 🔴 WHY THIS CANNOT BE A PLAIN `<form method="POST">` (unlike the sign-in
 * page's Google button). The endpoint deliberately accepts `application/json`
 * ONLY (see its own file header: a cross-site form can post `text/plain`, but
 * never `application/json`) — an ordinary HTML form submission can never set
 * that content type, so a `fetch`-driven island is required here, not a
 * stylistic choice.
 *
 * Own island, `client:load` at the call site, same reasoning as
 * `PasswordAuthForm`'s header: no fetch or request state exists until a
 * visitor submits.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UI_LABELS, type Lang } from '@lib/i18n';
import AgeConsentCheckbox from './AgeConsentCheckbox';

function uiLang(lang: string): Lang {
  return lang === 'en' ? 'en' : 'es';
}

export interface ConsentFormProps {
  /** Locale for copy and the two legal links. */
  lang: string;
  /** Where to navigate after a successful POST — already `safeNextPath`-validated by the page. */
  next: string;
}

export default function ConsentForm({ lang, next }: ConsentFormProps) {
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const t = UI_LABELS[uiLang(lang)].auth.consent;

  function goTo(destination: string) {
    window.location.assign(destination);
  }

  async function submit() {
    if (pending || !checked) return;
    setPending(true);
    setError(false);
    try {
      const res = await fetch('/api/auth/consentimiento', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ consent: true }),
      });
      if (!res.ok) {
        setPending(false);
        setError(true);
        toast.error(t.genericError);
        return;
      }
      goTo(next);
    } catch {
      setPending(false);
      setError(true);
      toast.error(t.genericError);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
      data-testid="consent-form"
    >
      <AgeConsentCheckbox
        lang={lang}
        id="consent-checkbox"
        checked={checked}
        onChange={setChecked}
        disabled={pending}
        data-testid="consent-checkbox"
      />

      <Button
        type="submit"
        disabled={pending || !checked}
        loading={pending}
        aria-describedby={!checked ? 'consent-checkbox-hint' : undefined}
        data-testid="consent-submit"
      >
        {t.continue}
      </Button>

      {!checked && (
        <p id="consent-checkbox-hint" className="text-xs text-muted-foreground">
          {t.checkboxHint}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t.genericError}
        </p>
      )}
    </form>
  );
}
