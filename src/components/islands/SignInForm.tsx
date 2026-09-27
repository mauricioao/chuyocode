/**
 * SignInForm — the interactive half of `/[lang]/auth/entrar.astro` (slice 4).
 *
 * Its OWN island, following the same reasoning `LikeButton`'s header argues:
 * the page needs no fetch and no request state at all until a visitor
 * actually submits, so the network concern stays out of the static page and
 * hydrates only this control (`client:load` at the call site).
 *
 * 🔴 THE NEUTRAL OUTCOME IS THE WHOLE POINT, NOT A DETAIL. `POST
 * /api/auth/signin` (`src/pages/api/auth/signin.ts`) answers the identical
 * 200 whether or not the submitted address has an account — that is what
 * makes it enumeration-proof (threat matrix T3). If this form showed a
 * different message depending on some signal read out of that response, it
 * would reopen the exact oracle the endpoint exists to close. So the only
 * thing this component ever branches on is whether the REQUEST completed
 * (`res.ok`) or not (a non-ok status, or `fetch` throwing) — never on
 * anything in the body. A completed request always renders {@link
 * COPY.success}, unconditionally.
 *
 * COPY IS LOCAL, exported and swept by this file's own test, exactly like
 * `LikeButton.COPY` — see that file's header for why the site-wide
 * `UI_LABELS` sweep in `i18n.test.ts` cannot reach it.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * This island's own chrome, in both locales.
 *
 * Neutral, impersonal Spanish: infinitives and impersonal prose, no voseo, no
 * second person at all — swept by `findVoseo` from this file's test.
 */
export const COPY = {
  es: {
    emailLabel: 'Correo electrónico',
    placeholder: 'nombre@ejemplo.com',
    submit: 'Enviar enlace',
    submitting: 'Enviando…',
    success:
      'Se envió un enlace de acceso a esa dirección, si corresponde a una cuenta. Revisar la bandeja de entrada y la carpeta de spam.',
    error: 'No se pudo enviar la solicitud. Intentar de nuevo.',
  },
  en: {
    emailLabel: 'Email address',
    placeholder: 'name@example.com',
    submit: 'Send link',
    submitting: 'Sending…',
    success:
      'A sign-in link was sent to that address, if it has an account. Check your inbox and spam folder.',
    error: 'Could not send the request. Try again.',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

/** Resolve copy for a locale, defaulting to Spanish — the site's primary locale. */
function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface SignInFormProps {
  /** Locale for {@link COPY} and the `lang` the server records at sign-in. */
  lang: string;
  /**
   * Where the visitor should land after confirming, already validated by
   * `safeNextPath` on the PAGE. Forwarded to `/api/auth/signin` unchanged and
   * OMITTED entirely when absent — `signin.ts` re-validates it regardless
   * (`safeNextPath(null)` is its own safe default), so this form never has to
   * repeat that guard.
   */
  next?: string;
}

type Status = 'idle' | 'pending' | 'sent' | 'error';

export default function SignInForm({ lang, next }: SignInFormProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const t = copyFor(lang);
  const pending = status === 'pending';

  async function requestLink() {
    if (pending) return;

    setStatus('pending');
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, lang, ...(next ? { next } : {}) }),
      });
      // See the file header: `res.ok` is the ONLY signal this branches on.
      setStatus(res.ok ? 'sent' : 'error');
    } catch {
      // Offline or aborted. Same neutral rule: the request did not complete,
      // so the visitor gets the retryable state, never the success one.
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <p role="status" data-testid="signin-success">
        {t.success}
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        // The inline arrow keeps the event UNTYPED at the call site: React
        // 19's types flag the `React.FormEvent<...>` generic as deprecated,
        // and inference off the `onSubmit` prop's own signature sidesteps it.
        event.preventDefault();
        void requestLink();
      }}
      className="flex flex-col gap-3"
      data-testid="signin-form"
    >
      <label htmlFor="signin-email" className="text-sm font-medium text-foreground">
        {t.emailLabel}
      </label>
      <input
        id="signin-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder={t.placeholder}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={pending}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <Button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        data-testid="signin-submit"
      >
        {pending ? t.submitting : t.submit}
      </Button>
      {status === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {t.error}
        </p>
      )}
    </form>
  );
}
