// @vitest-environment jsdom
/**
 * UserMenu tests (Login step 1b: user menu in the header).
 *
 * `UserMenu` is the client-only escape hatch for `Header.astro`'s public-cache
 * constraint: the header itself renders identically for every visitor, and
 * this island fetches `GET /api/me` after load to learn who is signed in.
 * These tests drive that fetch directly (mocked), so they never touch a real
 * network or Supabase — same posture as `SignInForm.test.tsx`/`AdModal.test.tsx`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { findVoseo } from '@/lib/neutralSpanish';
import { UI_LABELS } from '@/lib/i18n';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import UserMenu, { MOBILE_MENU_ACCOUNT_SLOT_ID } from './UserMenu';
import type { Profile } from '@/lib/profile';
import { readMeCache, writeMeCache } from '@/lib/meCache';

// `UserMenu` now takes its copy as a `labels` prop (see that component's own
// props doc) instead of resolving it itself from the full dictionary —
// these are the same two slices `Header.astro` computes server-side.
const esLabels = UI_LABELS.es.auth.userMenu;
const enLabels = UI_LABELS.en.auth.userMenu;

const GOOGLE_PROFILE: Profile = {
  name: 'Juan Perez',
  email: 'juan.perez@gmail.com',
  avatarUrl: 'https://lh3.googleusercontent.com/a/photo.jpg',
  initials: 'JP',
  plan: 'free',
  isModerator: false,
  moderationPendingCount: 0,
};

const PASSWORD_PROFILE: Profile = {
  name: 'lector',
  email: 'lector@example.com',
  avatarUrl: null,
  initials: 'L',
  plan: 'free',
  isModerator: false,
  moderationPendingCount: 0,
};

const PREMIUM_PROFILE: Profile = {
  name: 'lector',
  email: 'lector@example.com',
  avatarUrl: null,
  initials: 'L',
  plan: 'premium',
  isModerator: false,
  moderationPendingCount: 0,
};

const MODERATOR_PROFILE: Profile = {
  name: 'moderador',
  email: 'moderador@example.com',
  avatarUrl: null,
  initials: 'M',
  plan: 'free',
  isModerator: true,
  moderationPendingCount: 4,
};

/** Install a `fetch` stub answering `GET /api/me` with the given profile. */
function stubMe(profile: Profile | null) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ profile }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.getElementById(MOBILE_MENU_ACCOUNT_SLOT_ID)?.remove();
  sessionStorage.clear();
  window.history.pushState({}, '', '/');
});

/**
 * `Header.astro`'s own empty `#mobile-menu-account` slot — see `UserMenu.tsx`'s
 * own header. Real component tests don't render `Header.astro` itself, so
 * these tests stand the slot up by hand, the same way a real page already
 * has it present (empty) in its server-rendered markup before this island
 * ever mounts.
 */
function withMobileMenuSlot(): HTMLElement {
  const slot = document.createElement('div');
  slot.id = MOBILE_MENU_ACCOUNT_SLOT_ID;
  document.body.appendChild(slot);
  return slot;
}

describe('UserMenu — loading', () => {
  it('renders a fixed-size placeholder before the fetch resolves', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<UserMenu lang="es" labels={esLabels} />);
    expect(screen.getByTestId('user-menu-loading')).toBeTruthy();
    expect(screen.queryByTestId('user-menu-signin')).toBeNull();
    expect(screen.queryByTestId('user-menu-trigger')).toBeNull();
  });
});

describe('UserMenu — signed out', () => {
  it('shows a sign-in button to /<lang>/auth/entrar with next=<current path>', async () => {
    window.history.pushState({}, '', '/es/libros/clean-architecture');
    stubMe(null);
    render(<UserMenu lang="es" labels={esLabels} />);

    const link = await screen.findByTestId('user-menu-signin');
    expect(link.textContent).toBe(UI_LABELS.es.auth.userMenu.signIn);
    expect(link.getAttribute('href')).toBe(
      '/es/auth/entrar?next=%2Fes%2Flibros%2Fclean-architecture',
    );
  });

  it('does not show a create-account button (sign-up entry hidden for now)', async () => {
    window.history.pushState({}, '', '/es/libros/clean-architecture');
    stubMe(null);
    render(<UserMenu lang="es" labels={esLabels} />);

    await screen.findByTestId('user-menu-signin');
    expect(screen.queryByTestId('user-menu-signup')).toBeNull();
  });

  it('renders the sign-in button as the primary (brand yellow), rounded-full', async () => {
    stubMe(null);
    render(<UserMenu lang="es" labels={esLabels} />);

    const signIn = await screen.findByTestId('user-menu-signin');
    expect(signIn.className).toContain('rounded-full');
    // Primary: the brand-yellow fill (shadcn's "default" button variant).
    expect(signIn.className).toContain('bg-primary');
  });

  it('omits `next` when the current page is already an auth page', async () => {
    window.history.pushState({}, '', '/es/auth/nueva-clave');
    stubMe(null);
    render(<UserMenu lang="es" labels={esLabels} />);

    const link = await screen.findByTestId('user-menu-signin');
    expect(link.getAttribute('href')).toBe('/es/auth/entrar');
  });

  it('localizes the sign-in button to English', async () => {
    window.history.pushState({}, '', '/en/libros');
    stubMe(null);
    render(<UserMenu lang="en" labels={enLabels} />);

    expect((await screen.findByTestId('user-menu-signin')).textContent).toBe(
      UI_LABELS.en.auth.userMenu.signIn,
    );
  });

  it('shows the sign-in button on a network failure too (never gets stuck loading)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<UserMenu lang="es" labels={esLabels} />);
    await screen.findByTestId('user-menu-signin');
  });
});

describe('UserMenu — loading placeholder shape', () => {
  it('renders a neutral circle the size of the avatar, never the "Ingresar" pill shape', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<UserMenu lang="es" labels={esLabels} />);

    const placeholder = screen.getByTestId('user-menu-loading');
    const pills = placeholder.querySelectorAll('[data-loading-pill]');
    expect(pills.length).toBe(1);
    // Matches the signed-in avatar trigger's own `h-9 w-9 rounded-full`.
    expect(pills[0]?.className).toContain('h-9');
    expect(pills[0]?.className).toContain('w-9');
    expect(pills[0]?.className).toContain('rounded-full');
    expect(pills[0]?.className).not.toContain('w-24');
  });
});

describe('UserMenu — cached /api/me (instant account state, navigation-without-flicker PR)', () => {
  it('renders the avatar immediately from a cached signed-in profile, with no loading placeholder', () => {
    writeMeCache({ profile: PASSWORD_PROFILE });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<UserMenu lang="es" labels={esLabels} />);

    expect(screen.getByTestId('user-menu-trigger')).toBeTruthy();
    expect(screen.queryByTestId('user-menu-loading')).toBeNull();
  });

  it('renders "Ingresar" immediately from a cached signed-out result, with no loading placeholder', () => {
    writeMeCache({ profile: null });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<UserMenu lang="es" labels={esLabels} />);

    expect(screen.getByTestId('user-menu-signin')).toBeTruthy();
    expect(screen.queryByTestId('user-menu-loading')).toBeNull();
  });

  it('still revalidates in the background and updates the cache once the fetch resolves', async () => {
    writeMeCache({ profile: null });
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);

    expect(screen.getByTestId('user-menu-signin')).toBeTruthy();
    await screen.findByTestId('user-menu-trigger');
    expect(readMeCache()).toEqual({ profile: PASSWORD_PROFILE });
  });

  it('invalidates the cache right after a sign-in redirect (?auth=signed-in), even if a stale answer is cached', () => {
    writeMeCache({ profile: null });
    window.history.pushState({}, '', '/es/?auth=signed-in');
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<UserMenu lang="es" labels={esLabels} />);

    expect(screen.getByTestId('user-menu-loading')).toBeTruthy();
    expect(readMeCache()).toBeUndefined();
  });

  it('invalidates the cache right after a sign-out redirect (?auth=signed-out), even if a stale answer is cached', () => {
    writeMeCache({ profile: PASSWORD_PROFILE });
    window.history.pushState({}, '', '/es/?auth=signed-out');
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<UserMenu lang="es" labels={esLabels} />);

    expect(screen.getByTestId('user-menu-loading')).toBeTruthy();
    expect(readMeCache()).toBeUndefined();
  });

  it('invalidates the cache on a 401 from the background refresh', async () => {
    writeMeCache({ profile: PASSWORD_PROFILE });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({ profile: null }) }),
    );
    render(<UserMenu lang="es" labels={esLabels} />);

    await screen.findByTestId('user-menu-signin');
    expect(readMeCache()).toBeUndefined();
  });

  it('invalidates the cache when the sign-out form is submitted', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    const form = screen.getByTestId('user-menu-dropdown').querySelector('form');
    expect(readMeCache()).toEqual({ profile: PASSWORD_PROFILE });
    fireEvent.submit(form!);
    expect(readMeCache()).toBeUndefined();
  });
});

describe('UserMenu — hydration (Bug 1, React error #418)', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('does not report a recoverable hydration error with no cached /api/me answer', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => <UserMenu lang="es" labels={esLabels} />);
    expect(recoverableErrors).toEqual([]);
  });

  it('does not report a recoverable hydration error when a cached signed-in profile is already in sessionStorage on the client (the server never sees it)', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => <UserMenu lang="es" labels={esLabels} />, {
      sessionStorage: { 'chuyocode:me:v1': JSON.stringify({ profile: PASSWORD_PROFILE }) },
    });
    expect(recoverableErrors).toEqual([]);
  });

  it('does not report a recoverable hydration error when a cached signed-out answer is already in sessionStorage on the client', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => <UserMenu lang="es" labels={esLabels} />, {
      sessionStorage: { 'chuyocode:me:v1': JSON.stringify({ profile: null }) },
    });
    expect(recoverableErrors).toEqual([]);
  });

  it('does not report a recoverable hydration error right after a sign-in redirect (?auth=signed-in), with a stale cache present', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => <UserMenu lang="es" labels={esLabels} />, {
      sessionStorage: { 'chuyocode:me:v1': JSON.stringify({ profile: PASSWORD_PROFILE }) },
      locationSearch: '?auth=signed-in',
    });
    expect(recoverableErrors).toEqual([]);
  });
});

describe('UserMenu — signed in (avatar image, e.g. Google)', () => {
  it('renders the avatar image and no initials fallback', async () => {
    stubMe(GOOGLE_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);

    const trigger = await screen.findByTestId('user-menu-trigger');
    const img = trigger.querySelector('img');
    expect(img?.getAttribute('src')).toBe(GOOGLE_PROFILE.avatarUrl);
    expect(trigger.textContent).not.toContain('JP');
  });
});

describe('UserMenu — signed in (initials, e.g. email + password)', () => {
  it('renders initials in place of an avatar image when there is none', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);

    const trigger = await screen.findByTestId('user-menu-trigger');
    expect(trigger.querySelector('img')).toBeNull();
    expect(trigger.textContent).toBe('L');
  });
});

describe('UserMenu — dropdown', () => {
  it('is closed by default and opens on trigger click, with correct aria wiring', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);

    const trigger = await screen.findByTestId('user-menu-trigger');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('user-menu-dropdown')).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const dropdown = screen.getByTestId('user-menu-dropdown');
    expect(dropdown.getAttribute('id')).toBe(trigger.getAttribute('aria-controls'));
  });

  it('shows the name, email and free-plan badge', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    const dropdown = screen.getByTestId('user-menu-dropdown');
    expect(dropdown.textContent).toContain(PASSWORD_PROFILE.name);
    expect(dropdown.textContent).toContain(PASSWORD_PROFILE.email);
    expect(dropdown.textContent).toContain(UI_LABELS.es.auth.userMenu.planFree);
  });

  it('shows the Premium badge for a premium plan', async () => {
    stubMe(PREMIUM_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    const dropdown = screen.getByTestId('user-menu-dropdown');
    expect(dropdown.textContent).toContain(UI_LABELS.es.auth.userMenu.planPremium);
    expect(dropdown.textContent).not.toContain(UI_LABELS.es.auth.userMenu.planFree);
  });

  it('links to the activities creator, lang-prefixed', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    const link = screen.getByTestId('user-menu-create-activity');
    expect(link.getAttribute('href')).toBe('/es/crear');
    expect(link.textContent).toBe(UI_LABELS.es.auth.userMenu.createActivity);
  });

  it('links to the author workspace, lang-prefixed', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    const link = screen.getByTestId('user-menu-my-activities');
    expect(link.getAttribute('href')).toBe('/es/mis-actividades');
    expect(link.textContent).toBe(UI_LABELS.es.auth.userMenu.myActivities);
  });

  it('never shows a moderation link for an ordinary user', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    expect(screen.queryByTestId('user-menu-moderation')).toBeNull();
  });

  it('shows a moderation link with a pending-count badge for a moderator', async () => {
    stubMe(MODERATOR_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    const link = screen.getByTestId('user-menu-moderation');
    expect(link.getAttribute('href')).toBe('/es/admin/actividades');
    expect(link.textContent).toContain(UI_LABELS.es.auth.userMenu.moderation);
    expect(screen.getByTestId('user-menu-moderation-badge').textContent).toBe('4');
  });

  it('hides the badge when the moderator has nothing pending', async () => {
    stubMe({ ...MODERATOR_PROFILE, moderationPendingCount: 0 });
    render(<UserMenu lang="es" labels={esLabels} />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    expect(screen.getByTestId('user-menu-moderation')).toBeTruthy();
    expect(screen.queryByTestId('user-menu-moderation-badge')).toBeNull();
  });

  it('renders sign-out as a plain POST form with data-astro-reload', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    const form = screen.getByTestId('user-menu-dropdown').querySelector('form');
    expect(form?.getAttribute('method')).toBe('POST');
    expect(form?.getAttribute('action')).toBe('/api/auth/signout');
    expect(form?.hasAttribute('data-astro-reload')).toBe(true);
    expect(
      screen.getByRole('menuitem', { name: UI_LABELS.es.auth.userMenu.signOut }),
    ).toBeTruthy();
  });

  it('offers "Eliminar mi cuenta" in the dropdown, which opens the delete-account dialog', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    const entry = screen.getByTestId('user-menu-delete-account');
    expect(entry.getAttribute('role')).toBe('menuitem');
    expect(entry.textContent).toBe(UI_LABELS.es.auth.userMenu.deleteAccount);
    expect(screen.queryByTestId('delete-account-dialog')).toBeNull();

    fireEvent.click(entry);
    expect(screen.getByTestId('delete-account-dialog')).toBeTruthy();
  });

  it('closes on Escape', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    const trigger = await screen.findByTestId('user-menu-trigger');
    fireEvent.click(trigger);
    expect(screen.getByTestId('user-menu-dropdown')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('user-menu-dropdown')).toBeNull());
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on an outside click', async () => {
    stubMe(PASSWORD_PROFILE);
    render(
      <div>
        <div data-testid="outside">outside</div>
        <UserMenu lang="es" labels={esLabels} />
      </div>,
    );
    const trigger = await screen.findByTestId('user-menu-trigger');
    fireEvent.click(trigger);
    expect(screen.getByTestId('user-menu-dropdown')).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId('outside'));

    await waitFor(() => expect(screen.queryByTestId('user-menu-dropdown')).toBeNull());
  });

  it('stays open on a click inside the dropdown itself', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));
    const dropdown = screen.getByTestId('user-menu-dropdown');

    fireEvent.mouseDown(dropdown);

    expect(screen.queryByTestId('user-menu-dropdown')).toBeTruthy();
  });

  it('the trigger is keyboard focusable', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    const trigger = await screen.findByTestId('user-menu-trigger');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
  });

  /**
   * AVATAR HOVER: no yellow ring/border on hover, a subtle smooth scale
   * instead, disabled under reduced motion, and the keyboard focus indicator
   * kept regardless.
   */
  it('scales the avatar on hover instead of ringing it, and keeps a focus-visible indicator', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);
    const trigger = await screen.findByTestId('user-menu-trigger');

    expect(trigger.className).not.toContain('hover:border-primary');
    expect(trigger.className).toContain('hover:scale-');
    expect(trigger.className).toContain('transition-transform');
    // Reduced motion turns the scale (and its transition) off.
    expect(trigger.className).toMatch(/motion-reduce:.*scale-100|motion-reduce:transition-none/);
    // The keyboard-focus ring is untouched, and not itself motion-gated.
    expect(trigger.className).toContain('focus-visible:ring-3');
    expect(trigger.className).toContain('focus-visible:ring-ring/50');
  });
});

describe('UserMenu — localization', () => {
  it('writes its Spanish in neutral Spanish, with no voseo', () => {
    expect(findVoseo(UI_LABELS.es.auth.userMenu)).toEqual([]);
  });
});

describe('UserMenu — mobile hamburger menu account entries (mobile layout pass)', () => {
  it('does nothing (no crash, no stray nodes) when Header\'s mobile-menu slot is not present', async () => {
    stubMe(null);
    render(<UserMenu lang="es" labels={esLabels} />);
    await screen.findByTestId('user-menu-signin');
    // Nothing to assert on directly — the absence of a crash IS the test;
    // the top-bar rendering above is proof the component still works fine.
  });

  it('signed out: portals a single "Ingresar" link into the slot', async () => {
    const slot = withMobileMenuSlot();
    stubMe(null);
    render(<UserMenu lang="es" labels={esLabels} />);

    await screen.findByTestId('user-menu-signin'); // top-bar rendering, unaffected
    const mobileLink = await screen.findByTestId('mobile-account-signin');
    expect(slot.contains(mobileLink)).toBe(true);
    expect(mobileLink.textContent).toBe(UI_LABELS.es.auth.userMenu.signIn);
    expect(mobileLink.getAttribute('href')).toContain('/es/auth/entrar');
  });

  it('signed in: portals Crear actividad / Mis actividades / Cerrar sesión, no moderación for an ordinary user', async () => {
    const slot = withMobileMenuSlot();
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);

    const create = await screen.findByTestId('mobile-account-create-activity');
    expect(slot.contains(create)).toBe(true);
    expect(create.getAttribute('href')).toBe('/es/crear');

    const mine = screen.getByTestId('mobile-account-my-activities');
    expect(mine.getAttribute('href')).toBe('/es/mis-actividades');

    expect(screen.queryByTestId('mobile-account-moderation')).toBeNull();

    const signOutForm = screen.getByTestId('mobile-account-signout').closest('form');
    expect(signOutForm?.getAttribute('action')).toBe('/api/auth/signout');
    expect(signOutForm?.hasAttribute('data-astro-reload')).toBe(true);

    // The top-bar avatar+dropdown still renders too — the portal is ADDITIVE.
    expect(screen.getByTestId('user-menu-trigger')).toBeTruthy();
  });

  it('portals "Eliminar mi cuenta" too, which opens the delete-account dialog', async () => {
    const slot = withMobileMenuSlot();
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);

    const entry = await screen.findByTestId('mobile-account-delete-account');
    expect(slot.contains(entry)).toBe(true);
    expect(entry.textContent).toBe(UI_LABELS.es.auth.userMenu.deleteAccount);

    fireEvent.click(entry);
    expect(screen.getByTestId('delete-account-dialog')).toBeTruthy();
  });

  it('signed in as a moderator: portals the moderación entry with its pending-count badge', async () => {
    withMobileMenuSlot();
    stubMe(MODERATOR_PROFILE);
    render(<UserMenu lang="es" labels={esLabels} />);

    const moderation = await screen.findByTestId('mobile-account-moderation');
    expect(moderation.getAttribute('href')).toBe('/es/admin/actividades');
    expect(screen.getByTestId('mobile-account-moderation-badge').textContent).toBe('4');
  });

  it('portals nothing while still loading (avoids a flash of empty-state content)', () => {
    const slot = withMobileMenuSlot();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<UserMenu lang="es" labels={esLabels} />);
    expect(slot.childElementCount).toBe(0);
  });
});
