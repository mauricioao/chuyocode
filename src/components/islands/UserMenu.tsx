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
 *  - loading — a fixed-size placeholder (matching the signed-out layout, the
 *    common case for a fresh visit) so the header never jumps once the real
 *    answer (signed in or not) arrives.
 *  - signed out — a single primary (brand yellow) "Ingresar"/"Sign in"
 *    button to the sign-in page, with `next` set to the current path (the
 *    header never points `next` back at an auth page itself — see
 *    `isAuthPagePath` below). The "Crear cuenta"/"Sign up" entry point is
 *    hidden for now (kept commented below): users register from the sign-in
 *    page's own "create one" toggle (`PasswordAuthForm`) instead.
 *  - signed in — an avatar button (photo, or initials in a colored circle)
 *    that opens an accessible dropdown: name, email, a free-plan badge, and
 *    sign-out.
 *
 * 🔴 SIGN-OUT IS A PLAIN `<form method="POST" data-astro-reload>`, NEVER A
 * `fetch`. `data-astro-reload` is REQUIRED: Astro's ClientRouter otherwise
 * intercepts the submit and replays it through `fetch`, which drops the
 * server's redirect — see commit 6d550dd and `entrar.astro`'s identical form.
 *
 * View transitions (navigation-without-flicker PR): `Header.astro` now
 * carries `transition:persist`, so this island survives client-side
 * navigations as the SAME mounted instance instead of remounting into its
 * loading placeholder on every page — so the "instant" cached render below
 * only ever matters once per full page load anyway (a hard reload, a fresh
 * tab), never on a client-side navigation. On THAT full page load,
 * `meCache.ts`'s cached `/api/me` answer (`sessionStorage`) is applied in an
 * effect right after mount, not read synchronously during the first render:
 * this component's state ALWAYS starts at `loading` (see the SSR CONTRACT
 * below), the cached answer — when there is one — replaces it moments
 * later, same tick the one-time `justCompletedAuthFlow` cache-clear below
 * runs. The `/api/me` fetch below still always runs, in the background, to
 * revalidate whatever the cache said — it is never trusted on its own past
 * that first effect. The cache is invalidated (so a stale answer can never
 * survive past this component seeing it): right after a sign-in/sign-out
 * redirect (the `?auth=signed-in|signed-out` marker set by
 * `authRedirect.ts`), on submitting the sign-out form (before the full-page
 * reload that form triggers), and on a `401` from any background `/api/me`
 * refresh.
 *
 * SSR CONTRACT (Bug 1, React error #418): this component's rendered state is
 * `loading` on the server AND on the very first CLIENT render (hydration) —
 * full stop, regardless of what `meCache`/the URL already say. The PREVIOUS
 * shape read `meCache`/`justCompletedAuthFlow` synchronously in a lazy
 * `useState` initializer, which runs during the first CLIENT render too: a
 * visitor with a cached signed-in answer got the avatar chrome on that very
 * first client render while the server — which never reaches `sessionStorage`
 * or the request URL's marker at all — always rendered the neutral `loading`
 * placeholder, a hydration mismatch (React error #418) on every such visit.
 * Applying the cached answer (or clearing it, post-auth-flow) in the mount
 * effect below instead matches every other browser-only read in this
 * codebase (`useIsDesktop`, `usePrefersReducedMotion`, `meCache` itself):
 * the first commit always matches SSR, and a plain (non-hydration) render
 * updates it moments later.
 *
 * MOBILE HAMBURGER MENU (mobile layout pass): `Header.astro`'s own
 * `#mobile-menu` panel (opened by the hamburger button, `md:hidden`) used to
 * show only the primary nav links — no way to sign in, get to "Mis
 * actividades", or sign out without first finding the avatar chip. That
 * panel is plain server-rendered markup, though, and per this file's own
 * "byte-identical for every visitor" constraint above, `Header.astro` still
 * can't read `Astro.locals.user` to add those entries itself. Instead, THIS
 * island (already the one client-side source of truth for who is signed in)
 * portals a second copy of its account actions into an empty, pre-rendered
 * slot inside that panel (`#mobile-menu-account`, found by id after mount) —
 * one `/api/me` fetch, two renderings: the avatar+dropdown stays in the top
 * bar exactly as before, at every breakpoint, and the SAME state additionally
 * reaches the hamburger panel. `createPortal` returns `null` gracefully if
 * that element isn't found (an older layout, or a test rendering this
 * component in isolation) — the top-bar rendering is entirely unaffected.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SignInIcon } from '@phosphor-icons/react/dist/ssr/SignIn';
// Sign-up entry hidden for now; users register from the sign-in page. Kept
// commented, not deleted, so it can be restored with a one-line revert.
// import { UserPlusIcon } from '@phosphor-icons/react/dist/ssr/UserPlus';
import type { UI_LABELS } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Profile } from '@/lib/profile';
import { readMeCache, writeMeCache, clearMeCache } from '@/lib/meCache';
import { AUTH_ERROR_PARAM, AUTH_SIGNED_IN, AUTH_SIGNED_OUT } from '@/lib/authRedirect';

/** The id `Header.astro`'s `#mobile-menu` panel reserves for this island's portaled account entries — see the file header. */
export const MOBILE_MENU_ACCOUNT_SLOT_ID = 'mobile-menu-account';

export interface UserMenuProps {
  /** Active locale. Drives the sign-in link target and every other href this island builds. */
  lang: string;
  /**
   * This island's own copy, computed server-side from
   * `UI_LABELS[lang].auth.userMenu` (see `Header.astro`) instead of a `lang`
   * resolved against the full dictionary here — `UserMenu` is hydrated on
   * EVERY page (`Header.astro`, `client:load`), so importing all of
   * `UI_LABELS` in this file would ship its entire es+en copy (every
   * section, every feature) to every visitor just for these few strings.
   * Typed off `UI_LABELS` itself (keys only — `Record<..., string>`, not the
   * `es` literal values themselves) so the two can't drift, while still
   * accepting either locale's actual strings.
   */
  labels: Record<keyof (typeof UI_LABELS)['es']['auth']['userMenu'], string>;
}

type State =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; profile: Profile };

/** Where the current tab is, for the sign-in page's `next` round trip. */
function currentPath(): string {
  if (typeof window === 'undefined') {
    return '/';
  }
  return `${window.location.pathname}${window.location.search}`;
}

/** The current tab's bare pathname (no query/fragment), for {@link isAuthPagePath}. */
function currentPathname(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname;
}

/**
 * True for this site's own `/<lang>/auth/...` pages (`entrar`, `nueva-clave`).
 *
 * The sign-in link must never carry `next` back to an auth page itself —
 * that would round-trip a freshly authenticated visitor straight back to
 * `entrar` (or another auth page) instead of somewhere useful. Mirrors the
 * same-shaped guard in `@lib/authRedirect`'s `safeNextPath`, which closes the
 * matching hole server-side for every OTHER source of `next`.
 */
function isAuthPagePath(pathname: string): boolean {
  return /^\/[a-z]{2}\/auth(?:\/|$)/.test(pathname);
}

/**
 * True right after the confirm/sign-out redirect (the `?auth=signed-in` /
 * `?auth=signed-out` marker `authRedirect.ts` sets). A cached `/api/me`
 * answer read on THIS page load may predate that round trip, so it must not
 * be trusted — {@link initialState} clears it instead of reading it.
 */
function justCompletedAuthFlow(): boolean {
  if (typeof window === 'undefined') return false;
  const marker = new URLSearchParams(window.location.search).get(AUTH_ERROR_PARAM);
  return marker === AUTH_SIGNED_IN || marker === AUTH_SIGNED_OUT;
}

/**
 * The cached `/api/me` answer to apply right after mount — see the file
 * header's SSR CONTRACT. `undefined` means "nothing to apply" (no usable
 * cache): the mount effect below leaves the render at `loading` in that
 * case, same as a stale-cache-cleared post-auth-flow visit.
 */
function cachedState(): State | undefined {
  const cached = readMeCache();
  if (!cached) return undefined;
  return cached.profile ? { status: 'signed-in', profile: cached.profile } : { status: 'signed-out' };
}

export default function UserMenu({ lang, labels }: UserMenuProps) {
  const t = labels;
  // Always `loading` on the very first render, server AND client alike —
  // see the file header's SSR CONTRACT.
  const [state, setState] = useState<State>({ status: 'loading' });
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Applies the cached `/api/me` answer (or clears a stale one right after
  // an auth redirect) the moment this component actually mounts on the
  // client — never during the render itself, which is what kept the first
  // client render matching the server's `loading` output. The background
  // `/api/me` fetch below still always runs regardless, to revalidate.
  useEffect(() => {
    if (justCompletedAuthFlow()) {
      clearMeCache();
      return;
    }
    const cached = cachedState();
    if (cached) setState(cached);
  }, []);

  // Mobile hamburger menu (mobile layout pass) — see the file header. Found
  // by id after mount (`Header.astro` already renders the empty slot in its
  // static markup); stays `null` — and the portal below simply renders
  // nothing extra — if that slot isn't present (this component under test in
  // isolation, or an older layout).
  const [mobileMenuSlot, setMobileMenuSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMobileMenuSlot(document.getElementById(MOBILE_MENU_ACCOUNT_SLOT_ID));
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/me')
      .then(async (res) => {
        if (res.status === 401) {
          // Definitively signed out server-side — a cached signed-in answer
          // from before this response must not linger for the next mount.
          clearMeCache();
          return { profile: null };
        }
        if (!res.ok) {
          // Any other failure is ambiguous (a transient 5xx, for example) —
          // fall back to a safe signed-out RENDER without overwriting a
          // possibly-still-valid cached answer with it.
          return { profile: null };
        }
        const data = (await res.json()) as { profile: Profile | null };
        writeMeCache({ profile: data.profile });
        return data;
      })
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

  /**
   * The account entries `Header.astro`'s hamburger panel gets, portaled into
   * `mobileMenuSlot` — see the file header. `null` while still loading (the
   * panel simply keeps showing only its nav links until the real state
   * arrives, same "no visible jump" posture as the top-bar placeholder
   * above; the panel starts closed, so this never causes a flash either way).
   */
  function mobileAccountEntries(): React.ReactNode {
    if (state.status === 'loading') return null;

    if (state.status === 'signed-out') {
      const signInHref = isAuthPagePath(currentPathname())
        ? `/${lang}/auth/entrar`
        : `/${lang}/auth/entrar?next=${encodeURIComponent(currentPath())}`;
      return (
        <a href={signInHref} data-testid="mobile-account-signin" className="py-1 text-sm font-medium text-primary">
          {t.signIn}
        </a>
      );
    }

    const { profile } = state;
    return (
      <>
        <a href={`/${lang}/crear`} data-testid="mobile-account-create-activity" className="py-1 text-sm font-medium text-muted-foreground hover:text-primary">
          {t.createActivity}
        </a>
        <a
          href={`/${lang}/mis-actividades`}
          data-testid="mobile-account-my-activities"
          className="py-1 text-sm font-medium text-muted-foreground hover:text-primary"
        >
          {t.myActivities}
        </a>
        {profile.isModerator && (
          <a
            href={`/${lang}/admin/actividades`}
            data-testid="mobile-account-moderation"
            className="flex items-center justify-between py-1 text-sm font-medium text-muted-foreground hover:text-primary"
          >
            <span>{t.moderation}</span>
            {profile.moderationPendingCount > 0 && (
              <span
                data-testid="mobile-account-moderation-badge"
                className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground"
              >
                {profile.moderationPendingCount}
              </span>
            )}
          </a>
        )}
        <form method="POST" action="/api/auth/signout" data-astro-reload onSubmit={() => clearMeCache()}>
          <button type="submit" data-testid="mobile-account-signout" className="w-full py-1 text-left text-sm font-medium text-muted-foreground hover:text-primary">
            {t.signOut}
          </button>
        </form>
      </>
    );
  }

  const mobilePortal = mobileMenuSlot ? createPortal(mobileAccountEntries(), mobileMenuSlot) : null;

  if (state.status === 'loading') {
    // A NEUTRAL circle, sized like the avatar button below (`h-9 w-9
    // rounded-full`) — never the "Ingresar" pill shape. Which one the real
    // answer turns out to be is unknown yet (that's the whole point of this
    // state), so the placeholder must not look like either one of them;
    // `initialState` only ever reaches this branch when there is no cached
    // answer to render immediately instead.
    return (
      <div data-testid="user-menu-loading" aria-hidden="true" className="flex items-center gap-2">
        <Skeleton data-loading-pill className="h-9 w-9 rounded-full" />
      </div>
    );
  }

  if (state.status === 'signed-out') {
    const signInHref = isAuthPagePath(currentPathname())
      ? `/${lang}/auth/entrar`
      : `/${lang}/auth/entrar?next=${encodeURIComponent(currentPath())}`;
    return (
      <div className="flex items-center gap-2">
        <a
          href={signInHref}
          data-testid="user-menu-signin"
          className={cn(
            buttonVariants({ variant: 'default', size: 'sm' }),
            'gap-1.5 rounded-full',
          )}
        >
          <SignInIcon aria-hidden="true" size={16} />
          <span>{t.signIn}</span>
        </a>
        {/* Create-account: sign-up entry hidden for now; users register from
            the sign-in page (its own "¿Aún no tienes una cuenta?" toggle).
            Kept commented, not deleted, so it can be restored with a
            one-line revert.
        <a
          href={`${signInHref}&mode=signup`}
          data-testid="user-menu-signup"
          className={cn(
            buttonVariants({ variant: 'default', size: 'sm' }),
            'gap-1.5 rounded-full',
          )}
        >
          <UserPlusIcon aria-hidden="true" size={16} />
          <span>{t.signUp}</span>
        </a>
        */}
        {mobilePortal}
      </div>
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
        // No yellow ring/border on hover: a subtle, smooth scale instead
        // (~1.06, `duration-300 ease-out`), disabled under
        // `prefers-reduced-motion: reduce` via `motion-reduce:`. The
        // `focus-visible` ring is untouched and NOT gated behind
        // `motion-reduce` — it is the keyboard-focus indicator, an
        // accessibility requirement, not a decorative hover effect.
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-background text-sm font-semibold text-foreground transition-transform duration-300 ease-out hover:scale-[1.06] motion-reduce:transition-none motion-reduce:hover:scale-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
          <a
            href={`/${lang}/mis-actividades`}
            role="menuitem"
            data-testid="user-menu-my-activities"
            className="block w-full rounded-md px-3 py-1.5 text-left text-sm font-medium text-foreground hover:bg-muted"
          >
            {t.myActivities}
          </a>
          {profile.isModerator && (
            <a
              href={`/${lang}/admin/actividades`}
              role="menuitem"
              data-testid="user-menu-moderation"
              className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm font-medium text-foreground hover:bg-muted"
            >
              <span>{t.moderation}</span>
              {profile.moderationPendingCount > 0 && (
                <span
                  data-testid="user-menu-moderation-badge"
                  className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground"
                >
                  {profile.moderationPendingCount}
                </span>
              )}
            </a>
          )}
          <form
            method="POST"
            action="/api/auth/signout"
            data-astro-reload
            className="mt-1"
            onSubmit={() => clearMeCache()}
          >
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
      {mobilePortal}
    </div>
  );
}
