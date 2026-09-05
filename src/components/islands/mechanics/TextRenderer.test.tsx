// @vitest-environment jsdom
/**
 * TextRenderer tests — the `text` mechanic (fill in the blank).
 *
 * The load-bearing assertion here is that the renderer reports the RAW typed
 * string. Trimming and case-folding are the `text` comparator's job and are
 * already tested in exerciseGrading.test.ts; normalizing in both places is
 * exactly how the two drift apart and start disagreeing about what "sits " is.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Slot } from '@/lib/exercisePayload';
import TextRenderer from './TextRenderer';

/** No pool: the learner types. Two accepted alternatives, as the model allows. */
const slot: Slot = {
  id: 's1',
  label: 'The cat ___ on the mat',
  input: 'text',
  answer: ['sits', 'is sitting'],
};

function field(): HTMLInputElement {
  return screen.getByRole('textbox') as HTMLInputElement;
}

afterEach(cleanup);

describe('TextRenderer', () => {
  it('renders the slot label and a single text field', () => {
    render(<TextRenderer slot={slot} items={[]} value={[]} onChange={vi.fn()} />);

    // The label is rendered AS AUTHORED, `___` included. Splicing the input into
    // the sentence is a separate feature, not a silent reinterpretation here.
    expect(screen.getByText('The cat ___ on the mat')).toBeTruthy();
    expect(field().getAttribute('type')).toBe('text');
  });

  it('labels the field, so the blank has an accessible name', () => {
    render(<TextRenderer slot={slot} items={[]} value={[]} onChange={vi.fn()} />);

    // A bare input announces only "edit text". The label IS the question.
    expect(
      screen.getByRole('textbox', { name: 'The cat ___ on the mat' }),
    ).toBeTruthy();
  });

  it('reports the typed string RAW, without trimming or case-folding', () => {
    const onChange = vi.fn();
    render(
      <TextRenderer slot={slot} items={[]} value={[]} onChange={onChange} />,
    );

    fireEvent.change(field(), { target: { value: '  SiTs  ' } });

    // Verbatim. The comparator normalizes; the renderer must not, or the two
    // definitions of "equal" drift and only one of them is tested.
    expect(onChange).toHaveBeenCalledWith(['  SiTs  ']);
  });

  // TRIANGULATION: a different string must produce a different report, which is
  // what forces a real read of the event instead of a hardcoded return.
  it('reports a different string for different input', () => {
    const onChange = vi.fn();
    render(
      <TextRenderer slot={slot} items={[]} value={[]} onChange={onChange} />,
    );

    fireEvent.change(field(), { target: { value: 'is sitting' } });

    expect(onChange).toHaveBeenCalledWith(['is sitting']);
  });

  it('reflects a controlled value', () => {
    render(
      <TextRenderer slot={slot} items={[]} value={['sits']} onChange={vi.fn()} />,
    );

    expect(field().value).toBe('sits');
  });

  it('shows an empty field when there is no answer yet', () => {
    render(<TextRenderer slot={slot} items={[]} value={[]} onChange={vi.fn()} />);

    // Never `undefined`: React would flip the input to uncontrolled and warn.
    expect(field().value).toBe('');
  });

  // An emptied field is a NON-ANSWER, not the answer "". Reporting `['']` would
  // be an array of length 1, which `hasSubmittableAnswer` reads as "answered" —
  // re-arming the exact bug slice 1c fixed, where submit graded a non-attempt.
  // This is the same distinction the select placeholder makes; it is not
  // normalization, because no character is ever altered.
  it('reports NO answer when the field is cleared, not an empty string', () => {
    const onChange = vi.fn();
    render(
      <TextRenderer slot={slot} items={[]} value={['sits']} onChange={onChange} />,
    );

    fireEvent.change(field(), { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('keeps whitespace-only input as a real answer', () => {
    const onChange = vi.fn();
    render(
      <TextRenderer slot={slot} items={[]} value={[]} onChange={onChange} />,
    );

    // Only the EMPTY string means "nothing typed". Whitespace is something the
    // learner typed, and the comparator gets to decide it is wrong.
    fireEvent.change(field(), { target: { value: '   ' } });

    expect(onChange).toHaveBeenCalledWith(['   ']);
  });

  it('locks the field once disabled', () => {
    render(
      <TextRenderer
        slot={slot}
        items={[]}
        value={['sits']}
        onChange={vi.fn()}
        disabled
      />,
    );

    // A REAL attribute, not a dimmed style — same standard as the submit button.
    // The browser, not our code, is what refuses the edit.
    expect(field().hasAttribute('disabled')).toBe(true);
    expect(field().disabled).toBe(true);
  });
});
