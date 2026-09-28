/**
 * AuthPanel — the sign-in page's own switch between `PasswordAuthForm`
 * (default) and `SignInForm` (the magic link, kept as a secondary option;
 * Login step 1).
 *
 * The ONLY island mounted by `entrar.astro` for an anonymous visitor: the
 * Google button is a plain, unhydrated `<form>` rendered by the page itself
 * (see that file's header for why), so this is where the two remaining
 * sign-in methods live. Kept as its own thin component rather than folding
 * the toggle into `PasswordAuthForm` so that component stays about ONE
 * thing — email + password — and `SignInForm` stays exactly as tested,
 * untouched.
 *
 * COPY IS LOCAL, same rule as `SignInForm.COPY` / `PasswordAuthForm.COPY`.
 */
import { useState } from 'react';
import PasswordAuthForm from './PasswordAuthForm';
import SignInForm from './SignInForm';

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

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface AuthPanelProps {
  lang: string;
  next?: string;
  /**
   * Preselects `PasswordAuthForm`'s sign-up mode instead of sign-in. Set by
   * `entrar.astro` from `?mode=signup` (the header's create-account button).
   * Only affects the password form: the view toggle below (password vs.
   * magic link) always still starts on "password".
   */
  initialMode?: 'signin' | 'signup';
}

type View = 'password' | 'magic-link';

export default function AuthPanel({ lang, next, initialMode }: AuthPanelProps) {
  const [view, setView] = useState<View>('password');
  const t = copyFor(lang);

  return (
    <div className="flex flex-col gap-4" data-testid="auth-panel">
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
    </div>
  );
}
