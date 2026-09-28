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
import UserMenu from './UserMenu';
import type { Profile } from '@/lib/profile';

const GOOGLE_PROFILE: Profile = {
  name: 'Juan Perez',
  email: 'juan.perez@gmail.com',
  avatarUrl: 'https://lh3.googleusercontent.com/a/photo.jpg',
  initials: 'JP',
  plan: 'free',
};

const PASSWORD_PROFILE: Profile = {
  name: 'lector',
  email: 'lector@example.com',
  avatarUrl: null,
  initials: 'L',
  plan: 'free',
};

const PREMIUM_PROFILE: Profile = {
  name: 'lector',
  email: 'lector@example.com',
  avatarUrl: null,
  initials: 'L',
  plan: 'premium',
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
});

describe('UserMenu — loading', () => {
  it('renders a fixed-size placeholder before the fetch resolves', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<UserMenu lang="es" />);
    expect(screen.getByTestId('user-menu-loading')).toBeTruthy();
    expect(screen.queryByTestId('user-menu-signin')).toBeNull();
    expect(screen.queryByTestId('user-menu-trigger')).toBeNull();
  });
});

describe('UserMenu — signed out', () => {
  it('shows a sign-in button to /<lang>/auth/entrar with next=<current path>', async () => {
    window.history.pushState({}, '', '/es/libros/clean-architecture');
    stubMe(null);
    render(<UserMenu lang="es" />);

    const link = await screen.findByTestId('user-menu-signin');
    expect(link.textContent).toBe(UI_LABELS.es.auth.userMenu.signIn);
    expect(link.getAttribute('href')).toBe(
      '/es/auth/entrar?next=%2Fes%2Flibros%2Fclean-architecture',
    );
  });

  it('does not show a create-account button (sign-up entry hidden for now)', async () => {
    window.history.pushState({}, '', '/es/libros/clean-architecture');
    stubMe(null);
    render(<UserMenu lang="es" />);

    await screen.findByTestId('user-menu-signin');
    expect(screen.queryByTestId('user-menu-signup')).toBeNull();
  });

  it('renders the sign-in button as the primary (brand yellow), rounded-full', async () => {
    stubMe(null);
    render(<UserMenu lang="es" />);

    const signIn = await screen.findByTestId('user-menu-signin');
    expect(signIn.className).toContain('rounded-full');
    // Primary: the brand-yellow fill (shadcn's "default" button variant).
    expect(signIn.className).toContain('bg-primary');
  });

  it('omits `next` when the current page is already an auth page', async () => {
    window.history.pushState({}, '', '/es/auth/nueva-clave');
    stubMe(null);
    render(<UserMenu lang="es" />);

    const link = await screen.findByTestId('user-menu-signin');
    expect(link.getAttribute('href')).toBe('/es/auth/entrar');
  });

  it('localizes the sign-in button to English', async () => {
    window.history.pushState({}, '', '/en/libros');
    stubMe(null);
    render(<UserMenu lang="en" />);

    expect((await screen.findByTestId('user-menu-signin')).textContent).toBe(
      UI_LABELS.en.auth.userMenu.signIn,
    );
  });

  it('shows the sign-in button on a network failure too (never gets stuck loading)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<UserMenu lang="es" />);
    await screen.findByTestId('user-menu-signin');
  });
});

describe('UserMenu — loading placeholder width', () => {
  it('reserves the same layout as the single signed-out "Ingresar" button, so nothing jumps', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<UserMenu lang="es" />);

    const placeholder = screen.getByTestId('user-menu-loading');
    const pills = placeholder.querySelectorAll('[data-loading-pill]');
    expect(pills.length).toBe(1);
    expect(pills[0]?.className).toContain('w-24');
  });
});

describe('UserMenu — signed in (avatar image, e.g. Google)', () => {
  it('renders the avatar image and no initials fallback', async () => {
    stubMe(GOOGLE_PROFILE);
    render(<UserMenu lang="es" />);

    const trigger = await screen.findByTestId('user-menu-trigger');
    const img = trigger.querySelector('img');
    expect(img?.getAttribute('src')).toBe(GOOGLE_PROFILE.avatarUrl);
    expect(trigger.textContent).not.toContain('JP');
  });
});

describe('UserMenu — signed in (initials, e.g. email + password)', () => {
  it('renders initials in place of an avatar image when there is none', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" />);

    const trigger = await screen.findByTestId('user-menu-trigger');
    expect(trigger.querySelector('img')).toBeNull();
    expect(trigger.textContent).toBe('L');
  });
});

describe('UserMenu — dropdown', () => {
  it('is closed by default and opens on trigger click, with correct aria wiring', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" />);

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
    render(<UserMenu lang="es" />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    const dropdown = screen.getByTestId('user-menu-dropdown');
    expect(dropdown.textContent).toContain(PASSWORD_PROFILE.name);
    expect(dropdown.textContent).toContain(PASSWORD_PROFILE.email);
    expect(dropdown.textContent).toContain(UI_LABELS.es.auth.userMenu.planFree);
  });

  it('shows the Premium badge for a premium plan', async () => {
    stubMe(PREMIUM_PROFILE);
    render(<UserMenu lang="es" />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    const dropdown = screen.getByTestId('user-menu-dropdown');
    expect(dropdown.textContent).toContain(UI_LABELS.es.auth.userMenu.planPremium);
    expect(dropdown.textContent).not.toContain(UI_LABELS.es.auth.userMenu.planFree);
  });

  it('links to the activities creator, lang-prefixed', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    const link = screen.getByTestId('user-menu-create-activity');
    expect(link.getAttribute('href')).toBe('/es/crear');
    expect(link.textContent).toBe(UI_LABELS.es.auth.userMenu.createActivity);
  });

  it('renders sign-out as a plain POST form with data-astro-reload', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));

    const form = screen.getByTestId('user-menu-dropdown').querySelector('form');
    expect(form?.getAttribute('method')).toBe('POST');
    expect(form?.getAttribute('action')).toBe('/api/auth/signout');
    expect(form?.hasAttribute('data-astro-reload')).toBe(true);
    expect(
      screen.getByRole('menuitem', { name: UI_LABELS.es.auth.userMenu.signOut }),
    ).toBeTruthy();
  });

  it('closes on Escape', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" />);
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
        <UserMenu lang="es" />
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
    render(<UserMenu lang="es" />);
    fireEvent.click(await screen.findByTestId('user-menu-trigger'));
    const dropdown = screen.getByTestId('user-menu-dropdown');

    fireEvent.mouseDown(dropdown);

    expect(screen.queryByTestId('user-menu-dropdown')).toBeTruthy();
  });

  it('the trigger is keyboard focusable', async () => {
    stubMe(PASSWORD_PROFILE);
    render(<UserMenu lang="es" />);
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
    render(<UserMenu lang="es" />);
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
