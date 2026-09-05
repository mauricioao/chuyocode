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

/** A label with NO marker — a legitimate authoring style, not a broken slot. */
const noBlankSlot: Slot = {
  id: 's2',
  label: 'What did she say?',
  input: 'text',
  answer: ['hello'],
};

function field(): HTMLInputElement {
  return screen.getByRole('textbox') as HTMLInputElement;
}

afterEach(cleanup);

describe('TextRenderer', () => {
  it('renders the sentence around the field, with no marker left on screen', () => {
    render(<TextRenderer slot={slot} items={[]} value={[]} onChange={vi.fn()} />);

    const sentence = screen.getByTestId('slot-sentence-s1');
    expect(sentence.textContent).toContain('The cat');
    expect(sentence.textContent).toContain('on the mat');
    // The marker is a rendering instruction, not content. Leaving it visible next
    // to a real input is the "this reads like a form" bug this feature exists for.
    expect(sentence.textContent).not.toContain('___');
    expect(field().getAttribute('type')).toBe('text');
  });

  // The load-bearing assertion: INSIDE the sentence, and in the marker's POSITION.
  // A control appended after all the text would satisfy a naive containment check
  // while looking exactly like the stacked layout it is meant to replace.
  it('splices the field into the sentence where the blank was', () => {
    render(<TextRenderer slot={slot} items={[]} value={[]} onChange={vi.fn()} />);

    const sentence = screen.getByTestId('slot-sentence-s1');
    const nodes = Array.from(sentence.childNodes);
    const at = nodes.indexOf(field());

    expect(at).toBeGreaterThan(-1);
    expect(
      nodes.slice(0, at).map((n) => n.textContent).join(''),
    ).toBe('The cat ');
    expect(
      nodes.slice(at + 1).map((n) => n.textContent).join(''),
    ).toBe(' on the mat');
  });

  it('labels the field, so the blank has an accessible name', () => {
    render(<TextRenderer slot={slot} items={[]} value={[]} onChange={vi.fn()} />);

    // UNCHANGED by the inline layout. Splicing a control into a sentence destroys
    // the `<label htmlFor>` relationship, so the full authored sentence — marker
    // included — is carried on `aria-label` instead. A screen-reader user still
    // hears the whole question on focus.
    expect(
      screen.getByRole('textbox', { name: 'The cat ___ on the mat' }),
    ).toBeTruthy();
  });

  it('names the inline field with aria-label, not a dangling <label for>', () => {
    const { container } = render(
      <TextRenderer slot={slot} items={[]} value={[]} onChange={vi.fn()} />,
    );

    expect(field().getAttribute('aria-label')).toBe('The cat ___ on the mat');
    // A `<label for>` wrapping a sentence that CONTAINS its own control makes the
    // control part of its own label; the name is carried by the attribute instead.
    expect(container.querySelector('label[for="s1-text"]')).toBeNull();
  });

  it('keeps the stacked layout when the label carries no blank', () => {
    const { container } = render(
      <TextRenderer slot={noBlankSlot} items={[]} value={[]} onChange={vi.fn()} />,
    );

    // No gap to splice into: the real `<label htmlFor>` relationship is intact and
    // preferable, so nothing about today's layout changes.
    const label = container.querySelector('label[for="s2-text"]');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('What did she say?');
    expect(screen.queryByTestId('slot-sentence-s2')).toBeNull();
    expect(field().getAttribute('aria-label')).toBeNull();
  });

  it('still names the field when the label has no blank', () => {
    render(
      <TextRenderer slot={noBlankSlot} items={[]} value={[]} onChange={vi.fn()} />,
    );

    expect(
      screen.getByRole('textbox', { name: 'What did she say?' }),
    ).toBeTruthy();
  });

  it('renders an inline field for a label that is only a blank', () => {
    const bare: Slot = { id: 's3', label: '___', input: 'text', answer: ['x'] };
    render(<TextRenderer slot={bare} items={[]} value={[]} onChange={vi.fn()} />);

    // Empty `before` and `after` must not crash or fall back to stacked.
    expect(screen.getByTestId('slot-sentence-s3')).toBeTruthy();
    expect(field().getAttribute('aria-label')).toBe('___');
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

  // The inline layout is PRESENTATION ONLY. These two pin that: the value the
  // renderer reports and the lock it honours are identical on both paths, so
  // grading cannot notice which layout was drawn.
  it('reports the same value on the stacked path as on the inline one', () => {
    const onChange = vi.fn();
    render(
      <TextRenderer slot={noBlankSlot} items={[]} value={[]} onChange={onChange} />,
    );

    fireEvent.change(field(), { target: { value: '  SiTs  ' } });

    expect(onChange).toHaveBeenCalledWith(['  SiTs  ']);
  });

  it('locks the field on the stacked path too', () => {
    render(
      <TextRenderer
        slot={noBlankSlot}
        items={[]}
        value={['hello']}
        onChange={vi.fn()}
        disabled
      />,
    );

    expect(field().disabled).toBe(true);
  });
});
