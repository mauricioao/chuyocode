// @vitest-environment jsdom
/**
 * AgeConsentCheckbox tests — the Ley N° 29733 consent sentence + checkbox,
 * shared between `PasswordAuthForm`'s sign-up mode and the standalone
 * consent screen's `ConsentForm`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { findVoseo } from '@/lib/neutralSpanish';
import { UI_LABELS } from '@lib/i18n';
import AgeConsentCheckbox from './AgeConsentCheckbox';

// jsdom has no ResizeObserver; `Checkbox` (Radix) reads one via
// `@radix-ui/react-use-size` — same stub precedent as
// `LessonForm.test.tsx`/`WorksheetZoneEditor.test.tsx`.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AgeConsentCheckbox — es', () => {
  it('renders unchecked by default and surfaces the owner-approved sentence', () => {
    render(
      <AgeConsentCheckbox
        lang="es"
        id="test-consent"
        checked={false}
        onChange={() => {}}
        data-testid="consent-checkbox"
      />,
    );

    expect(screen.getByTestId('consent-checkbox').getAttribute('data-state')).toBe('unchecked');
    expect(screen.getByText(UI_LABELS.es.auth.consent.termsLinkText)).toBeTruthy();
    expect(screen.getByText(UI_LABELS.es.auth.consent.privacyLinkText)).toBeTruthy();
  });

  it('links Términos and Política de privacidad to the /es legal routes', () => {
    render(
      <AgeConsentCheckbox lang="es" id="test-consent" checked={false} onChange={() => {}} />,
    );

    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/es/legal/terms',
      '/es/legal/privacy',
    ]);
  });

  it('calls onChange(true) when clicked', () => {
    const onChange = vi.fn();
    render(
      <AgeConsentCheckbox
        lang="es"
        id="test-consent"
        checked={false}
        onChange={onChange}
        data-testid="consent-checkbox"
      />,
    );
    fireEvent.click(screen.getByTestId('consent-checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reflects a checked=true prop (controlled)', () => {
    render(
      <AgeConsentCheckbox
        lang="es"
        id="test-consent"
        checked
        onChange={() => {}}
        data-testid="consent-checkbox"
      />,
    );
    expect(screen.getByTestId('consent-checkbox').getAttribute('data-state')).toBe('checked');
  });

  it('respects the disabled prop', () => {
    render(
      <AgeConsentCheckbox
        lang="es"
        id="test-consent"
        checked={false}
        onChange={() => {}}
        disabled
        data-testid="consent-checkbox"
      />,
    );
    expect(screen.getByTestId('consent-checkbox').hasAttribute('disabled')).toBe(true);
  });

  it('carries no regional (voseo) copy', () => {
    expect(findVoseo(UI_LABELS.es.auth.consent)).toEqual([]);
  });
});

describe('AgeConsentCheckbox — en', () => {
  it('links Terms and Privacy Policy to the /en legal routes', () => {
    render(
      <AgeConsentCheckbox lang="en" id="test-consent" checked={false} onChange={() => {}} />,
    );

    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/en/legal/terms',
      '/en/legal/privacy',
    ]);
    expect(screen.getByText(UI_LABELS.en.auth.consent.termsLinkText)).toBeTruthy();
    expect(screen.getByText(UI_LABELS.en.auth.consent.privacyLinkText)).toBeTruthy();
  });
});
