/**
 * ProfilePasswordForm — the "Contraseña" section of the Perfil page (T3):
 * change the signed-in visitor's own password. Mounted ONLY for an account
 * with an email/password identity — `[lang]/perfil.astro` renders
 * `passwordGoogleOnlyNote` instead for a Google-only account, and the
 * server independently re-checks the same thing (`/api/cuenta/contrasena.ts`'s
 * own header) — never trust the client alone.
 *
 * Client-side validation (new/confirm match, new password meets
 * `MIN_PASSWORD_LENGTH`) is a nicer UX only; the server re-verifies the
 * CURRENT password (by signing in with it) and re-validates the new one
 * independently either way.
 *
 * 🔴 TURNSTILE IS INERT UNTIL `PUBLIC_TURNSTILE_SITE_KEY` IS SET, same
 * posture as `PasswordAuthForm`/`SignInForm`: `siteKey` is `null` when
 * unset, so no `<TurnstileWidget>` renders, submit is never held disabled
 * waiting for a token, and the request body never carries `captchaToken`.
 * Once a token arrives it is sent with the save request; the widget is reset
 * (and submit re-disabled) after EVERY attempt, success or failure, because
 * Turnstile tokens are single-use — same reasoning as `PasswordAuthForm`'s
 * own `resetCaptcha`.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { isValidPassword } from '@/lib/authValidation';
import { getTurnstileSiteKey } from '@/lib/turnstile';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import TurnstileWidget from './TurnstileWidget';

export interface ProfilePasswordFormProps {
  lang: Lang;
}

type Status = 'idle' | 'saving' | 'error';

/** Maps `/api/cuenta/contrasena.ts`'s own error codes to this page's labels — anything NOT listed here (`bad_request`, `no_password_identity`, `update_failed`, an unrecognized code) falls back to `passwordErrorGeneric`, never a raw Supabase message. */
const SERVER_ERROR_LABEL = {
  invalid_current_password: 'passwordErrorInvalidCurrent',
  reauthentication_needed: 'passwordErrorReauthRequired',
  same_password: 'passwordErrorSamePassword',
  // "weak" and "too short" read the same to a visitor — no separate label.
  weak_password: 'passwordErrorTooShort',
  // Supabase's Turnstile captcha rejection — distinct from
  // `invalid_current_password` (see `/api/cuenta/contrasena.ts`'s header).
  captcha_failed: 'passwordErrorCaptchaFailed',
} as const satisfies Record<string, keyof (typeof UI_LABELS)['es']['profile']>;

export default function ProfilePasswordForm({ lang }: ProfilePasswordFormProps) {
  const t = UI_LABELS[lang].profile;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  // `null` while unset (`@lib/turnstile`'s header) — every captcha-related
  // line below is gated on it, same as `PasswordAuthForm`/`SignInForm`.
  const siteKey = getTurnstileSiteKey();
  const needsCaptcha = siteKey !== null && captchaToken === null;

  /**
   * Tokens are single-use (Turnstile): clear the stale one and bump the
   * widget's reset signal together, so submit goes back to "waiting for
   * verification" immediately rather than staying enabled with a token
   * Supabase will no longer accept.
   */
  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaResetSignal((n) => n + 1);
  }

  async function submit() {
    if (newPassword !== confirmPassword) {
      setError(t.passwordErrorMismatch);
      return;
    }
    if (!isValidPassword(newPassword)) {
      setError(t.passwordErrorTooShort);
      return;
    }
    setStatus('saving');
    setError(null);
    try {
      const res = await fetch('/api/cuenta/contrasena', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          ...(captchaToken ? { captchaToken } : {}),
        }),
      });
      // Every attempt, success or failure (see this file's header).
      resetCaptcha();

      const body: { ok?: unknown; error?: unknown } = await res.json().catch(() => ({}));
      if (!res.ok || body.ok !== true) {
        const code = typeof body.error === 'string' ? body.error : '';
        const labelKey = (SERVER_ERROR_LABEL as Record<string, keyof typeof t>)[code];
        setError(labelKey ? t[labelKey] : t.passwordErrorGeneric);
        setStatus('error');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStatus('idle');
      toast.success(t.passwordSuccessToast);
    } catch {
      resetCaptcha();
      setError(t.passwordErrorGeneric);
      setStatus('error');
    }
  }

  return (
    <form
      data-testid="profile-password-form"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={t.currentPasswordLabel}>
        {({ id }) => (
          <Input
            id={id}
            type="password"
            name="current-password"
            autoComplete="current-password"
            data-testid="profile-current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={status === 'saving'}
          />
        )}
      </Field>
      <Field label={t.newPasswordLabel}>
        {({ id }) => (
          <Input
            id={id}
            type="password"
            name="new-password"
            autoComplete="new-password"
            data-testid="profile-new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={status === 'saving'}
          />
        )}
      </Field>
      <Field label={t.confirmNewPasswordLabel}>
        {({ id }) => (
          <Input
            id={id}
            type="password"
            name="confirm-new-password"
            autoComplete="new-password"
            data-testid="profile-confirm-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={status === 'saving'}
          />
        )}
      </Field>
      {siteKey && (
        <TurnstileWidget
          siteKey={siteKey}
          language={lang}
          onToken={setCaptchaToken}
          resetSignal={captchaResetSignal}
        />
      )}
      {error && (
        <p role="alert" data-testid="profile-password-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button
          type="submit"
          data-testid="profile-password-save"
          loading={status === 'saving'}
          disabled={status === 'saving' || needsCaptcha}
          aria-describedby={needsCaptcha ? 'profile-password-captcha-hint' : undefined}
        >
          {status === 'saving' ? t.passwordSaving : t.passwordSaveButton}
        </Button>
      </div>
      {needsCaptcha && (
        <p id="profile-password-captcha-hint" className="text-xs text-muted-foreground">
          {t.passwordCaptchaPending}
        </p>
      )}
    </form>
  );
}
