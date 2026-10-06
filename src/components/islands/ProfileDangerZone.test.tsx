// @vitest-environment jsdom
/**
 * ProfileDangerZone tests (Perfil page, T3) — a thin wrapper around
 * `DeleteAccountDialog` (already covered by `UserMenu.test.tsx`/its own
 * usage there); this file only proves the wrapper wires it correctly with
 * this page's own calm, outline-only trigger.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import ProfileDangerZone from './ProfileDangerZone';

afterEach(() => cleanup());

describe('ProfileDangerZone', () => {
  it('renders a calm (non-destructive-filled) trigger with the "Eliminar mi cuenta" label', () => {
    render(<ProfileDangerZone lang="es" />);
    const trigger = screen.getByTestId('profile-delete-account-trigger');
    expect(trigger.textContent).toBe('Eliminar mi cuenta');
    expect(screen.queryByTestId('delete-account-dialog')).toBeNull();
  });

  it('opens the shared delete-account dialog on click', () => {
    render(<ProfileDangerZone lang="es" />);
    fireEvent.click(screen.getByTestId('profile-delete-account-trigger'));
    expect(screen.getByTestId('delete-account-dialog')).toBeTruthy();
  });

  it('localizes to English', () => {
    render(<ProfileDangerZone lang="en" />);
    expect(screen.getByTestId('profile-delete-account-trigger').textContent).toBe('Delete my account');
  });
});

describe('ProfileDangerZone — hydration (Bug 1, React error #418)', () => {
  it('does not report a recoverable hydration error', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => <ProfileDangerZone lang="es" />);
    expect(recoverableErrors).toEqual([]);
  });
});
