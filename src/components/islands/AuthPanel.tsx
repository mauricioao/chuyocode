/**
 * AuthPanel — the sign-in page's own wrapper around `PasswordAuthForm`.
 *
 * The ONLY island mounted by `entrar.astro` for an anonymous visitor: the
 * Google button is a plain, unhydrated `<form>` rendered by the page itself
 * (see that file's header for why), so this is where email + password lives.
 * Kept as its own thin component (rather than folding `PasswordAuthForm`
 * straight into `entrar.astro`) so a future re-introduction of an
 * alternate sign-in method has a natural home again — see below.
 *
 * 🔴 THE MAGIC-LINK OPTION IS HIDDEN, NOT DELETED. `SignInForm` (the "email
 * me a link instead" form) and the toggle that switched to it are commented
 * out below rather than removed: magic link hidden until custom SMTP
 * (Resend) is configured — sending through Supabase's shared mail sender
 * hits their rate limit too easily for a real user base. `POST
 * /api/auth/signin` and `SignInForm.tsx` are untouched and still fully
 * covered by their own tests; only this entry point into them is disabled.
 * Restoring it is a one-line uncomment here.
 *
 * COPY IS LOCAL, same rule as `SignInForm.COPY` / `PasswordAuthForm.COPY`.
 */
import PasswordAuthForm from './PasswordAuthForm';
// import { useState } from 'react';
// import SignInForm from './SignInForm';

export const COPY = {
  es: {
    magicLinkToggle: 'Enviar un enlace de acceso en su lugar',
    backToPassword: 'Volver a correo y contraseña',
  },
  en: {
    magicLinkToggle: 'Email me a link instead',
    backToPassword: 'Back to email and password',
  },
} as const;

// type Copy = (typeof COPY)[keyof typeof COPY];
//
// function copyFor(lang: string): Copy {
//   return lang === 'en' ? COPY.en : COPY.es;
// }

export interface AuthPanelProps {
  lang: string;
  next?: string;
  /**
   * Preselects `PasswordAuthForm`'s sign-up mode instead of sign-in. Set by
   * `entrar.astro` from `?mode=signup` (the header's create-account button).
   */
  initialMode?: 'signin' | 'signup';
}

// type View = 'password' | 'magic-link';

export default function AuthPanel({ lang, next, initialMode }: AuthPanelProps) {
  // Magic link hidden for now — see the file header. `view`/`setView`/`t`
  // are unused while it stays disabled.
  // const [view, setView] = useState<View>('password');
  // const t = copyFor(lang);

  return (
    <div className="flex flex-col gap-4" data-testid="auth-panel">
      <PasswordAuthForm lang={lang} next={next} initialMode={initialMode} />
      {/* Magic link hidden until custom SMTP (Resend) is configured.
      {view === 'password' ? (
        <PasswordAuthForm lang={lang} next={next} initialMode={initialMode} />
      ) : (
        <SignInForm lang={lang} next={next} />
      )}
      <button
        type="button"
        onClick={() => setView(view === 'password' ? 'magic-link' : 'password')}
        className="self-start text-sm font-medium text-accent hover:text-accent-hover hover:underline"
        data-testid="auth-panel-toggle"
      >
        {view === 'password' ? t.magicLinkToggle : t.backToPassword}
      </button>
      */}
    </div>
  );
}
