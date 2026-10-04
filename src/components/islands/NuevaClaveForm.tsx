/**
 * NuevaClaveForm — the interactive half of
 * `/[lang]/auth/nueva-clave.astro` (Login step 1, password reset).
 *
 * Own island, same reasoning as `SignInForm`'s header: the page needs no
 * fetch or request state until a visitor submits, so only this control
 * hydrates (`client:load` at the call site).
 *
 * Unlike `SignInForm`, this endpoint is NOT enumeration-sensitive — the
 * caller already holds the session the reset link granted, so there is
 * nothing left to hide about which account this is. The only local
 * validation is the minimum length, checked here so a visitor gets instant
 * feedback rather than a round trip for something `@lib/authValidation`
 * would reject anyway.
 *
 * COPY IS LOCAL, exported and swept by this file's own test, same rule as
 * `SignInForm.COPY` — see that file's header for why the site-wide
 * `UI_LABELS` sweep in `i18n.test.ts` cannot reach it.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Kept in sync with `MIN_PASSWORD_LENGTH` in `@lib/authValidation`. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * This island's own chrome, in both locales. Neutral Latin-American tuteo,
 * no voseo — swept by `findVoseo` from this file's test.
 */
export const COPY = {
  es: {
    passwordLabel: 'Nueva contraseña',
    placeholder: 'Mínimo 8 caracteres',
    submit: 'Guardar contraseña',
    submitting: 'Guardando…',
    success: 'Contraseña actualizada. Ya se puede usar para entrar.',
    error: 'No se pudo actualizar la contraseña. Inténtalo de nuevo.',
    tooShort: 'La contraseña debe tener al menos 8 caracteres.',
  },
  en: {
    passwordLabel: 'New password',
    placeholder: 'At least 8 characters',
    submit: 'Save password',
    submitting: 'Saving…',
    success: 'Password updated. It can now be used to sign in.',
    error: 'Could not update the password. Try again.',
    tooShort: 'The password must be at least 8 characters long.',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

/** Resolve copy for a locale, defaulting to Spanish — the site's primary locale. */
function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface NuevaClaveFormProps {
  /** Locale for {@link COPY}. */
  lang: string;
}

type Status = 'idle' | 'pending' | 'success' | 'error' | 'too-short';

export default function NuevaClaveForm({ lang }: NuevaClaveFormProps) {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const t = copyFor(lang);
  const pending = status === 'pending';

  async function save() {
    if (pending) return;

    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus('too-short');
      return;
    }

    setStatus('pending');
    try {
      const res = await fetch('/api/auth/nueva-clave', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setStatus('success');
      } else {
        setStatus('error');
        toast.error(t.error);
      }
    } catch {
      setStatus('error');
      toast.error(t.error);
    }
  }

  if (status === 'success') {
    return (
      <p role="status" data-testid="nueva-clave-success">
        {t.success}
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        // Inline arrow keeps the event untyped at the call site, same
        // reason as `SignInForm`.
        event.preventDefault();
        void save();
      }}
      className="flex flex-col gap-3"
      data-testid="nueva-clave-form"
    >
      <label htmlFor="nueva-clave-password" className="text-sm font-semibold text-foreground">
        {t.passwordLabel}
      </label>
      <Input
        id="nueva-clave-password"
        name="password"
        type="password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        autoComplete="new-password"
        placeholder={t.placeholder}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={pending}
      />
      <Button
        type="submit"
        disabled={pending}
        loading={pending}
        data-testid="nueva-clave-submit"
      >
        {t.submit}
      </Button>
      {status === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {t.error}
        </p>
      )}
      {status === 'too-short' && (
        <p role="alert" className="text-sm text-destructive">
          {t.tooShort}
        </p>
      )}
    </form>
  );
}
