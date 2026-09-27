/**
 * UserMenu — client-only identity chip mounted in the header (Login step 1b).
 *
 * `Header.astro` renders BYTE-IDENTICAL HTML for every visitor: it is part
 * of `BaseLayout`, which every PUBLIC page (home, libros, noticias) serves
 * under a public cache policy (`src/lib/httpCache.ts`). Baking
 * `Astro.locals.user` into that markup would let the CDN serve one
 * visitor's name/avatar to the next request for the same URL — the exact
 * hazard `markPrivate`/T7 exists to close elsewhere. So identity never
 * reaches the server render here at all: this island hydrates after load
 * and asks `GET /api/me` (always private/no-store) who is signed in. That
 * endpoint reads the SAME `locals.user` middleware already resolved for
 * every sign-in method (Google, email + password, magic link) — this
 * component never branches on which one was used.
 *
 * States:
 *  - loading — a fixed-size placeholder, so the header never jumps once the
 *    real answer (signed in or not) arrives.
 *  - signed out — a plain "Entrar"/"Sign in" link to the sign-in page, with
 *    `next` set to the current path so the visitor returns here afterwards.
 *  - signed in — an avatar button (photo, or initials in a colored circle)
 *    that opens an accessible dropdown: name, email, a free-plan badge, and
 *    sign-out.
 *
 * 🔴 SIGN-OUT IS A PLAIN `<form method="POST" data-astro-reload>`, NEVER A
 * `fetch`. `data-astro-reload` is REQUIRED: Astro's ClientRouter otherwise
 * intercepts the submit and replays it through `fetch`, which drops the
 * server's redirect — see commit 6d550dd and `entrar.astro`'s identical form.
 *
 * View transitions: this component is NOT `transition:persist`, so a normal
 * Astro navigation unmounts and remounts it fresh on the new page, which
 * re-runs the `/api/me` fetch and always reflects the CURRENT session —
 * important right after a sign-in/sign-out redirect.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { UI_LABELS } from '@/lib/i18n';
import type { Profile } from '@/lib/profile';

export interface UserMenuProps {
  /** Active locale. Drives the sign-in link target and all copy. */
  lang: string;
}

type State =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; profile: Profile };

function copyFor(lang: string) {
  return lang === 'en' ? UI_LABELS.en.auth.userMenu : UI_LABELS.es.auth.userMenu;
}

/** Where the current tab is, for the sign-in page's `next` round trip. */
function currentPath(): string {
  if (typeof window === 'undefined') {
    return '/';
  }
  return `${window.location.pathname}${window.location.search}`;
}

export default function UserMenu({ lang }: UserMenuProps) {
  const t = copyFor(lang);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    let cancelled = false;

    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : { profile: null }))
      .then((data: { profile: Profile | null }) => {
        if (cancelled) return;
        setState(
          data.profile
            ? { status: 'signed-in', profile: data.profile }
            : { status: 'signed-out' },
        );
      })
      .catch(() => {
        // Offline or the request failed outright. Treat it the same as
        // signed out rather than leaving the placeholder up forever: an
        // anonymous-looking header is the safe default, and the visitor can
        // still reach every page — sign-in is one click away either way.
        if (!cancelled) setState({ status: 'signed-out' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        close();
      }
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, close]);

  if (state.status === 'loading') {
    // Fixed size, matching the signed-in trigger below, so nothing in the
    // header shifts once the real state (signed in or not) is known.
    return (
      <div
        data-testid="user-menu-loading"
        aria-hidden="true"
        className="h-9 w-9 animate-pulse rounded-full bg-muted"
      />
    );
  }

  if (state.status === 'signed-out') {
    const next = encodeURIComponent(currentPath());
    return (
      <a
        href={`/${lang}/auth/entrar?next=${next}`}
        data-testid="user-menu-signin"
        className="text-sm font-medium text-muted-foreground transition-theme duration-theme hover:text-primary"
      >
        {t.signIn}
      </a>
    );
  }

  const { profile } = state;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-testid="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t.accountMenu}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-background text-sm font-semibold text-foreground transition-theme duration-theme hover:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true">{profile.initials}</span>
        )}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          data-testid="user-menu-dropdown"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-md border border-border bg-background p-3 shadow-lg"
        >
          <p className="truncate text-sm font-medium text-foreground">{profile.name}</p>
          <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
          <span className="mt-2 inline-flex w-fit rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {profile.plan === 'premium' ? t.planPremium : t.planFree}
          </span>
          <a
            href={`/${lang}/crear`}
            role="menuitem"
            data-testid="user-menu-create-activity"
            className="mt-3 block w-full rounded-md px-3 py-1.5 text-left text-sm font-medium text-foreground hover:bg-muted"
          >
            {t.createActivity}
          </a>
          <form method="POST" action="/api/auth/signout" data-astro-reload className="mt-1">
            <button
              type="submit"
              role="menuitem"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-left text-sm font-medium text-foreground hover:bg-muted"
            >
              {t.signOut}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
