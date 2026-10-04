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
 * ONE DELIBERATE EXCEPTION: a non-ok response whose body is
 * `{ error: 'captcha_failed' }` renders {@link COPY.captchaError} instead of
 * {@link COPY.error}. Still safe for T3 — see `signin.ts`'s header — because
 * that body shape depends only on the submitted Turnstile token, never on
 * the address, so it is identical for a known and an unknown email and adds
 * no new signal about which this caller is.
 *
 * COPY IS LOCAL, exported and swept by this file's own test, exactly like
 * `LikeButton.COPY` — see that file's header for why the site-wide
 * `UI_LABELS` sweep in `i18n.test.ts` cannot reach it.
 *
 * 🔴 TURNSTILE IS INERT UNTIL `PUBLIC_TURNSTILE_SITE_KEY` IS SET, same
 * posture as `PasswordAuthForm`'s header: `siteKey` is `null` when unset
 * (`@lib/turnstile`), so no widget renders, no script loads, and
 * `captchaToken` stays `null` forever, so the request body never carries it.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getTurnstileSiteKey } from '@lib/turnstile';
import TurnstileWidget from './TurnstileWidget';

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
    captchaPending: 'Esperando verificación…',
    captchaError: 'No pudimos verificar que eres una persona. Inténtalo de nuevo.',
  },
  en: {
    emailLabel: 'Email address',
    placeholder: 'name@example.com',
    submit: 'Send link',
    submitting: 'Sending…',
    success:
      'A sign-in link was sent to that address, if it has an account. Check your inbox and spam folder.',
    error: 'Could not send the request. Try again.',
    captchaPending: 'Waiting for verification…',
    captchaError: "We couldn't verify you're human. Please try again.",
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

type Status = 'idle' | 'pending' | 'sent' | 'error' | 'captcha-error';

interface SignInResponseBody {
  ok: boolean;
  error?: string;
}

export default function SignInForm({ lang, next }: SignInFormProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  const t = copyFor(lang);
  const pending = status === 'pending';
  // `null` while unset — see this file's header and `@lib/turnstile`.
  const siteKey = getTurnstileSiteKey();
  const needsCaptcha = siteKey !== null && captchaToken === null;

  /** Tokens are single-use: see `PasswordAuthForm.resetCaptcha`'s comment. */
  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaResetSignal((n) => n + 1);
  }

  async function requestLink() {
    if (pending) return;

    setStatus('pending');
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          lang,
          ...(next ? { next } : {}),
          ...(captchaToken ? { captchaToken } : {}),
        }),
      });
      resetCaptcha();

      if (res.ok) {
        // See the file header: `res.ok` is otherwise the ONLY signal this
        // branches on.
        setStatus('sent');
        return;
      }
      const body = (await res.json().catch(() => null)) as SignInResponseBody | null;
      if (body?.error === 'captcha_failed') {
        setStatus('captcha-error');
      } else {
        setStatus('error');
        toast.error(t.error);
      }
    } catch {
      // Offline or aborted. Same neutral rule: the request did not complete,
      // so the visitor gets the retryable state, never the success one.
      resetCaptcha();
      setStatus('error');
      toast.error(t.error);
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
      <label htmlFor="signin-email" className="text-sm font-semibold text-foreground">
        {t.emailLabel}
      </label>
      <Input
        id="signin-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder={t.placeholder}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={pending}
      />
      {siteKey && (
        <TurnstileWidget
          siteKey={siteKey}
          language={lang}
          onToken={setCaptchaToken}
          resetSignal={captchaResetSignal}
        />
      )}
      <Button
        type="submit"
        disabled={pending || needsCaptcha}
        loading={pending}
        aria-describedby={needsCaptcha ? 'signin-captcha-hint' : undefined}
        data-testid="signin-submit"
      >
        {t.submit}
      </Button>
      {needsCaptcha && (
        <p id="signin-captcha-hint" className="text-xs text-muted-foreground">
          {t.captchaPending}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {t.error}
        </p>
      )}
      {status === 'captcha-error' && (
        <p role="alert" className="text-sm text-destructive">
          {t.captchaError}
        </p>
      )}
    </form>
  );
}
