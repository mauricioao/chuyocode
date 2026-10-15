// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { Block } from '@/lib/activities/blocks';
import SubmitForReviewDialog, { type SubmitForReviewDialogProps } from './SubmitForReviewDialog';

afterEach(() => cleanup());

const BASE_PROPS: SubmitForReviewDialogProps = {
  lang: 'es',
  open: true,
  submitting: false,
  errorMessage: null,
  blocks: [],
  onConfirm: () => {},
  onCancel: () => {},
  onEnlargeSmallZones: () => {},
  onViewSmallZone: () => {},
};

describe('SubmitForReviewDialog', () => {
  it('renders nothing (closed) when open is false', () => {
    render(<SubmitForReviewDialog {...BASE_PROPS} open={false} />);
    expect(screen.queryByTestId('submit-for-review-dialog')).toBeNull();
  });

  it('shows the title, the rights checkbox (unchecked), and disables confirm until it is checked', () => {
    render(<SubmitForReviewDialog {...BASE_PROPS} />);
    const checkbox = screen.getByTestId('submit-rights-checkbox');
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    expect((screen.getByTestId('submit-dialog-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables confirm once the rights checkbox is checked, and calls onConfirm', () => {
    const onConfirm = vi.fn();
    render(<SubmitForReviewDialog {...BASE_PROPS} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('submit-rights-checkbox'));
    const confirmBtn = screen.getByTestId('submit-dialog-confirm') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('resets the checkbox back to unchecked whenever it re-opens', () => {
    const { rerender } = render(<SubmitForReviewDialog {...BASE_PROPS} />);
    fireEvent.click(screen.getByTestId('submit-rights-checkbox'));
    expect(screen.getByTestId('submit-rights-checkbox').getAttribute('aria-checked')).toBe('true');

    rerender(<SubmitForReviewDialog {...BASE_PROPS} open={false} />);
    rerender(<SubmitForReviewDialog {...BASE_PROPS} />);
    expect(screen.getByTestId('submit-rights-checkbox').getAttribute('aria-checked')).toBe('false');
  });

  it('shows the confirm button as loading/aria-busy and disables both buttons while submitting', () => {
    render(<SubmitForReviewDialog {...BASE_PROPS} submitting />);
    const confirm = screen.getByTestId('submit-dialog-confirm') as HTMLButtonElement;
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(confirm.disabled).toBe(true);
    expect((screen.getByTestId('submit-dialog-cancel') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an inline error message when given one', () => {
    render(
      <SubmitForReviewDialog
        {...BASE_PROPS}
        errorMessage="No se pudo enviar la actividad. Inténtalo de nuevo."
      />,
    );
    expect(screen.getByTestId('submit-dialog-error').textContent).toContain('No se pudo enviar');
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<SubmitForReviewDialog {...BASE_PROPS} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('submit-dialog-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders English copy for lang="en"', () => {
    render(<SubmitForReviewDialog {...BASE_PROPS} lang="en" />);
    expect(screen.getByTestId('submit-for-review-dialog').textContent).toContain('Submit this activity for review');
  });
});

describe('SubmitForReviewDialog — projection warnings (non-blocking, GROUPED — owner report)', () => {
  const LONG_PROMPT_QUIZ: Block = {
    id: 'q1',
    type: 'quiz',
    payload: { pools: {}, slots: [{ id: 's1', label: 'A'.repeat(200), input: 'text', answer: ['x'] }] },
  };

  const TINY_ZONE_WORKSHEET: Block = {
    id: 'w1',
    type: 'worksheet',
    rotation: 0,
    image: { path: 'activity-images/abc/img-1.webp', width: 2000, height: 2000 },
    zones: [{ id: 'tiny', x: 0.5, y: 0.5, w: 0.01, h: 0.01, kind: 'text', answers: ['x'] }],
  };

  // The owner's exact repro: the same "Esta zona es muy pequeña..." line
  // repeated once per small zone, 10 times, with no way to know what to do.
  const TEN_TINY_ZONES_WORKSHEET: Block = {
    id: 'w1',
    type: 'worksheet',
    rotation: 0,
    image: { path: 'activity-images/abc/img-1.webp', width: 2000, height: 2000 },
    zones: Array.from({ length: 10 }, (_, i) => ({
      id: `tiny-${i}`,
      x: 0.01 * i,
      y: 0.5,
      w: 0.01,
      h: 0.01,
      kind: 'text' as const,
      answers: ['x'],
    })),
  };

  it('shows nothing when nothing would project poorly', () => {
    render(<SubmitForReviewDialog {...BASE_PROPS} />);
    expect(screen.queryByTestId('submit-projection-warnings')).toBeNull();
  });

  it('warns about a quiz prompt too long to project well, with a count of 1', () => {
    render(<SubmitForReviewDialog {...BASE_PROPS} blocks={[LONG_PROMPT_QUIZ]} />);
    const panel = screen.getByTestId('submit-projection-warnings');
    expect(panel.textContent).toContain('Antes de proyectar');
    expect(panel.textContent).toContain('1 pregunta es muy larga para proyectarse bien.');
  });

  it('warns about a worksheet zone too small to project well, with a count of 1', () => {
    render(<SubmitForReviewDialog {...BASE_PROPS} blocks={[TINY_ZONE_WORKSHEET]} />);
    const panel = screen.getByTestId('submit-projection-warnings');
    expect(panel.textContent).toContain('1 zona es chica para verse bien en un proyector.');
  });

  it('groups 10 small zones into ONE line with a count of 10, not 10 repeated lines (the owner\'s exact repro)', () => {
    render(<SubmitForReviewDialog {...BASE_PROPS} blocks={[TEN_TINY_ZONES_WORKSHEET]} />);
    const panel = screen.getByTestId('submit-projection-warnings');
    expect(panel.textContent).toContain('10 zonas son chicas para verse bien en un proyector.');
    expect(screen.queryAllByTestId('projection-warning-worksheet_zone_too_small')).toHaveLength(1);
  });

  it('lists one summary line per warning kind when both are present', () => {
    render(<SubmitForReviewDialog {...BASE_PROPS} blocks={[LONG_PROMPT_QUIZ, TINY_ZONE_WORKSHEET]} />);
    expect(screen.getByTestId('projection-warning-quiz_prompt_too_long').textContent).toContain('pregunta');
    expect(screen.getByTestId('projection-warning-worksheet_zone_too_small').textContent).toContain('zona');
  });

  it('never disables the confirm button — purely informational', () => {
    render(<SubmitForReviewDialog {...BASE_PROPS} blocks={[LONG_PROMPT_QUIZ, TINY_ZONE_WORKSHEET]} />);
    fireEvent.click(screen.getByTestId('submit-rights-checkbox'));
    expect((screen.getByTestId('submit-dialog-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders English copy for lang="en"', () => {
    render(<SubmitForReviewDialog {...BASE_PROPS} lang="en" blocks={[LONG_PROMPT_QUIZ]} />);
    expect(screen.getByTestId('submit-projection-warnings').textContent).toContain(
      '1 question is too long to project well.',
    );
  });

  it('only the zone-too-small line shows the "Agrandar"/"Ver cuáles" actions, never the quiz-prompt line', () => {
    render(<SubmitForReviewDialog {...BASE_PROPS} blocks={[LONG_PROMPT_QUIZ, TINY_ZONE_WORKSHEET]} />);
    expect(screen.getByTestId('submit-projection-grow-zones')).toBeTruthy();
    expect(screen.getByTestId('submit-projection-view-zones')).toBeTruthy();
    // Exactly one of each — not one per warning kind.
    expect(screen.getAllByTestId('submit-projection-grow-zones')).toHaveLength(1);
  });

  it('"Agrandar las zonas chicas" calls onEnlargeSmallZones', () => {
    const onEnlargeSmallZones = vi.fn();
    render(
      <SubmitForReviewDialog
        {...BASE_PROPS}
        blocks={[TINY_ZONE_WORKSHEET]}
        onEnlargeSmallZones={onEnlargeSmallZones}
      />,
    );
    fireEvent.click(screen.getByTestId('submit-projection-grow-zones'));
    expect(onEnlargeSmallZones).toHaveBeenCalledTimes(1);
  });

  it('the warning updates on its own once the parent re-renders with grown blocks (no local dialog state)', () => {
    const { rerender } = render(<SubmitForReviewDialog {...BASE_PROPS} blocks={[TINY_ZONE_WORKSHEET]} />);
    expect(screen.getByTestId('submit-projection-warnings')).toBeTruthy();

    const grownWorksheet: Block = {
      ...TINY_ZONE_WORKSHEET,
      zones: [{ id: 'tiny', x: 0.4, y: 0.4, w: 0.2, h: 0.2, kind: 'text', answers: ['x'] }],
    };
    rerender(<SubmitForReviewDialog {...BASE_PROPS} blocks={[grownWorksheet]} />);
    expect(screen.queryByTestId('submit-projection-warnings')).toBeNull();
  });

  it('"Ver cuáles" calls onViewSmallZone with the FIRST small zone\'s block/zone id, then closes the dialog', () => {
    const onViewSmallZone = vi.fn();
    const onCancel = vi.fn();
    render(
      <SubmitForReviewDialog
        {...BASE_PROPS}
        blocks={[TEN_TINY_ZONES_WORKSHEET]}
        onViewSmallZone={onViewSmallZone}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId('submit-projection-view-zones'));
    expect(onViewSmallZone).toHaveBeenCalledTimes(1);
    expect(onViewSmallZone).toHaveBeenCalledWith('w1', 'tiny-0');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
