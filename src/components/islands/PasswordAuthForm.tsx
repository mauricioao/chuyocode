/**
 * PasswordAuthForm — email + password sign-in, sign-up and forgot-password,
 * one island with three internal modes (Login step 1).
 *
 * Own island, `client:load` at the call site (`AuthPanel`), same reasoning
 * as `SignInForm`'s header: no fetch or request state exists until a
 * visitor submits.
 *
 * 🔴 SIGN-IN IS NOT ENUMERATION-PROOF, DELIBERATELY. Unlike the magic-link
 * and sign-up/reset flows, `POST /api/auth/password`'s `signin` action HAS
 * to answer differently on success vs. failure — the caller needs to know
 * whether it worked. What both the endpoint and this form still never do is
 * distinguish WHY it failed: {@link COPY.signInError} is the one message for
 * a wrong password AND for an address with no account.
 *
 * `signup` and `reset` stay uniform, mirroring the endpoint: both always
 * show {@link COPY.signUpSent} / {@link COPY.resetSent} on a completed
 * request, never branching on what the response body actually says (the
 * body is uniform too, so there is nothing to branch on) — the neutral
 * outcome is the whole point, same rule as `SignInForm`'s header. The one
 * signal this form DOES read from the body is `signedIn` on `signup`, which
 * is a PROJECT-WIDE setting (email confirmation disabled), never a
 * per-address one, so reading it cannot reopen the oracle.
 *
 * COPY IS LOCAL, exported and swept by this file's own test, same rule as
 * `SignInForm.COPY`.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Kept in sync with `MIN_PASSWORD_LENGTH` in `@lib/authValidation`. */
const MIN_PASSWORD_LENGTH = 8;

export const COPY = {
  es: {
    emailLabel: 'Correo electrónico',
    emailPlaceholder: 'nombre@ejemplo.com',
    passwordLabel: 'Contraseña',
    passwordPlaceholder: 'Mínimo 8 caracteres',
    signInSubmit: 'Entrar',
    signInSubmitting: 'Entrando…',
    signUpSubmit: 'Crear cuenta',
    signUpSubmitting: 'Creando…',
    signInError: 'Correo o contraseña incorrectos.',
    tooShort: 'La contraseña debe tener al menos 8 caracteres.',
    signUpSent:
      'Se envió un correo de confirmación a esa dirección, si corresponde a una cuenta nueva. Revisar la bandeja de entrada y la carpeta de spam.',
    genericError: 'No se pudo completar la solicitud. Intentar de nuevo.',
    forgotPassword: '¿Olvidaste la contraseña?',
    resetSubmit: 'Enviar instrucciones',
    resetSubmitting: 'Enviando…',
    resetSent:
      'Se enviaron instrucciones para restablecer la contraseña a esa dirección, si corresponde a una cuenta. Revisar la bandeja de entrada y la carpeta de spam.',
    backToSignIn: 'Volver a entrar',
    switchToSignUp: '¿Aún no tienes una cuenta? ¿Qué esperas?',
    switchToSignIn: '¿Ya hay una cuenta? Entrar',
  },
  en: {
    emailLabel: 'Email address',
    emailPlaceholder: 'name@example.com',
    passwordLabel: 'Password',
    passwordPlaceholder: 'At least 8 characters',
    signInSubmit: 'Sign in',
    signInSubmitting: 'Signing in…',
    signUpSubmit: 'Create account',
    signUpSubmitting: 'Creating…',
    signInError: 'Incorrect email or password.',
    tooShort: 'The password must be at least 8 characters long.',
    signUpSent:
      'A confirmation email was sent to that address, if it can be used for a new account. Check your inbox and spam folder.',
    genericError: 'Could not complete the request. Try again.',
    forgotPassword: 'Forgot your password?',
    resetSubmit: 'Send instructions',
    resetSubmitting: 'Sending…',
    resetSent:
      'Password reset instructions were sent to that address, if it has an account. Check your inbox and spam folder.',
    backToSignIn: 'Back to sign in',
    switchToSignUp: "Don't have an account yet? What are you waiting for?",
    switchToSignIn: 'Already have an account? Sign in',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

/** Resolve copy for a locale, defaulting to Spanish — the site's primary locale. */
function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface PasswordAuthFormProps {
  /** Locale for {@link COPY} and the `lang` the server records. */
  lang: string;
  /**
   * Where a successful sign-in (or an immediate sign-up session) should
   * navigate to, already validated by `safeNextPath` on the page. Forwarded
   * to `/api/auth/password` only for `signup` — `signin`/`reset` re-derive
   * or ignore it server-side, same "the endpoint re-validates regardless"
   * posture as `SignInForm`.
   */
  next?: string;
  /**
   * Preselects sign-up mode instead of the sign-in default. Set by
   * `entrar.astro` from `?mode=signup` — the header's "Crear cuenta"/"Sign
   * up" button (`UserMenu`) links here with that query param as a hint, via
   * `AuthPanel`.
   */
  initialMode?: 'signin' | 'signup';
}

type Mode = 'signin' | 'signup' | 'reset';
type Status = 'idle' | 'pending' | 'error' | 'sent' | 'too-short';

interface PasswordResponseBody {
  ok: boolean;
  signedIn?: boolean;
}

export default function PasswordAuthForm({ lang, next, initialMode }: PasswordAuthFormProps) {
  const [mode, setMode] = useState<Mode>(initialMode ?? 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const t = copyFor(lang);
  const pending = status === 'pending';

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setStatus('idle');
    setPassword('');
  }

  function goTo(destination: string) {
    window.location.assign(destination);
  }

  async function submit() {
    if (pending) return;

    if (mode === 'signup' && password.length < MIN_PASSWORD_LENGTH) {
      setStatus('too-short');
      return;
    }

    setStatus('pending');
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: mode,
          email,
          lang,
          ...(mode !== 'reset' ? { password } : {}),
          ...(mode === 'signup' && next ? { next } : {}),
        }),
      });

      if (!res.ok) {
        setStatus('error');
        return;
      }

      const body = (await res.json()) as PasswordResponseBody;

      if (mode === 'signin') {
        goTo(next ?? `/${lang}/`);
        return;
      }
      if (mode === 'signup' && body.signedIn) {
        goTo(next ?? `/${lang}/`);
        return;
      }
      // `signup` with no immediate session, and `reset` (always uniform):
      // same neutral "check your email" outcome, never branching on
      // anything the response body says beyond `signedIn` above.
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <p role="status" data-testid="password-auth-sent">
        {mode === 'reset' ? t.resetSent : t.signUpSent}
      </p>
    );
  }

  const submitLabel =
    mode === 'signin'
      ? pending
        ? t.signInSubmitting
        : t.signInSubmit
      : mode === 'signup'
        ? pending
          ? t.signUpSubmitting
          : t.signUpSubmit
        : pending
          ? t.resetSubmitting
          : t.resetSubmit;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-3"
      data-testid="password-auth-form"
    >
      <label htmlFor="password-auth-email" className="text-sm font-semibold text-foreground">
        {t.emailLabel}
      </label>
      <Input
        id="password-auth-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder={t.emailPlaceholder}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={pending}
      />

      {mode !== 'reset' && (
        <>
          <label htmlFor="password-auth-password" className="text-sm font-semibold text-foreground">
            {t.passwordLabel}
          </label>
          <Input
            id="password-auth-password"
            name="password"
            type="password"
            required
            minLength={mode === 'signup' ? MIN_PASSWORD_LENGTH : undefined}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder={t.passwordPlaceholder}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
          />
        </>
      )}

      <Button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        data-testid="password-auth-submit"
      >
        {submitLabel}
      </Button>

      {status === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {mode === 'signin' ? t.signInError : t.genericError}
        </p>
      )}
      {status === 'too-short' && (
        <p role="alert" className="text-sm text-destructive">
          {t.tooShort}
        </p>
      )}

      <div className="flex flex-col gap-1 text-sm">
        {mode === 'signin' && (
          <>
            <button
              type="button"
              onClick={() => switchMode('reset')}
              className="self-start text-accent hover:text-accent-hover hover:underline"
            >
              {t.forgotPassword}
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="self-start text-accent hover:text-accent-hover hover:underline"
            >
              {t.switchToSignUp}
            </button>
          </>
        )}
        {mode === 'signup' && (
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="self-start text-accent hover:text-accent-hover hover:underline"
          >
            {t.switchToSignIn}
          </button>
        )}
        {mode === 'reset' && (
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="self-start text-accent hover:text-accent-hover hover:underline"
          >
            {t.backToSignIn}
          </button>
        )}
      </div>
    </form>
  );
}
