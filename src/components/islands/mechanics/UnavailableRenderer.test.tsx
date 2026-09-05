// @vitest-environment jsdom
/**
 * UnavailableRenderer tests — the degraded state for a slot whose mechanic has
 * not shipped.
 *
 * Content and code deploy through different pipelines and WILL drift out of
 * sync. An exercise authored for a renderer that does not exist yet must not
 * take the page down, and must not silently pretend to be answerable
 * (docs/exercise-model.md, "Why this cannot break existing exercises", point 3).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Slot } from '@/lib/exercisePayload';
import UnavailableRenderer from './UnavailableRenderer';

const slot: Slot = {
  id: 'h1',
  label: 'Tap the kitchen',
  input: 'hotspot',
  answer: ['x'],
};

afterEach(cleanup);

describe('UnavailableRenderer', () => {
  it('still shows the slot label so the exercise stays readable', () => {
    render(<UnavailableRenderer slot={slot} message="Not available yet" />);

    expect(screen.getByText('Tap the kitchen')).toBeTruthy();
  });

  it('announces the degraded state with the localized message', () => {
    render(<UnavailableRenderer slot={slot} message="Aún no disponible" />);

    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain('Aún no disponible');
  });

  // TRIANGULATION: a different message must actually reach the DOM, which rules
  // out a hardcoded string.
  it('renders a different message verbatim', () => {
    render(<UnavailableRenderer slot={slot} message="Not available yet" />);

    expect(screen.getByRole('status').textContent).toContain(
      'Not available yet',
    );
  });

  it('offers no answerable control — an ungradeable slot must not look gradeable', () => {
    render(<UnavailableRenderer slot={slot} message="Not available yet" />);

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders without a label rather than throwing on a malformed slot', () => {
    render(
      <UnavailableRenderer
        slot={{ ...slot, label: '' }}
        message="Not available yet"
      />,
    );

    expect(screen.getByRole('status').textContent).toContain(
      'Not available yet',
    );
  });
});
