// @vitest-environment jsdom
/**
 * SelectRenderer tests — the `select` mechanic (dropdown).
 *
 * Two things carry the weight:
 *  - the reported value is the ITEM ID, never the option's position or its
 *    visible text (docs/exercise-model.md, "Stable ids, never positions"),
 *  - the placeholder is a real, distinguishable "nothing chosen yet" state and
 *    clears the answer rather than submitting `""` as one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PoolItem, Slot } from '@/lib/exercisePayload';
import SelectRenderer from './SelectRenderer';

const slot: Slot = {
  id: 'olives_qty',
  label: 'olives',
  input: 'select',
  pool: 'quantifiers',
  answer: ['some'],
};

const items: PoolItem[] = [
  { id: 'a', text: 'a' },
  { id: 'an', text: 'an' },
  { id: 'some', text: 'some' },
];

function box(): HTMLSelectElement {
  return screen.getByRole('combobox') as HTMLSelectElement;
}

afterEach(cleanup);

describe('SelectRenderer', () => {
  it('renders the slot label and one option per pool item, plus a placeholder', () => {
    render(
      <SelectRenderer slot={slot} items={items} value={[]} onChange={vi.fn()} />,
    );

    expect(screen.getByText('olives')).toBeTruthy();
    // 3 pool items + the placeholder.
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getByRole('option', { name: 'some' })).toBeTruthy();
  });

  it('labels the dropdown, so it has an accessible name', () => {
    render(
      <SelectRenderer slot={slot} items={items} value={[]} onChange={vi.fn()} />,
    );

    expect(screen.getByRole('combobox', { name: 'olives' })).toBeTruthy();
  });

  it('uses the supplied placeholder copy for the empty option', () => {
    render(
      <SelectRenderer
        slot={slot}
        items={items}
        value={[]}
        onChange={vi.fn()}
        placeholder="Elegir una opción"
      />,
    );

    const placeholder = screen.getByRole('option', {
      name: 'Elegir una opción',
    }) as HTMLOptionElement;
    // The empty VALUE is what makes "nothing chosen" distinguishable from an id.
    expect(placeholder.value).toBe('');
  });

  it('starts on the placeholder when there is no answer yet', () => {
    render(
      <SelectRenderer slot={slot} items={items} value={[]} onChange={vi.fn()} />,
    );

    // NOT the first pool item: pre-selecting one would answer for the learner
    // and make a wrong answer look like a deliberate choice.
    expect(box().value).toBe('');
  });

  it('reports the selected ITEM ID, not its position or its text', () => {
    const onChange = vi.fn();
    render(
      <SelectRenderer slot={slot} items={items} value={[]} onChange={onChange} />,
    );

    fireEvent.change(box(), { target: { value: 'some' } });

    expect(onChange).toHaveBeenCalledWith(['some']);
  });

  // TRIANGULATION: a different option must yield a different id. This is what
  // rules out a hardcoded return, and it is the assertion that would have caught
  // an index-based implementation.
  it('reports a different id for a different option', () => {
    const onChange = vi.fn();
    render(
      <SelectRenderer slot={slot} items={items} value={[]} onChange={onChange} />,
    );

    fireEvent.change(box(), { target: { value: 'an' } });

    expect(onChange).toHaveBeenCalledWith(['an']);
    // Positional would have reported index 1; textual would have reported "an"
    // only by coincidence here, which is why the `some`/`a` cases exist too.
    expect(onChange).not.toHaveBeenCalledWith([1]);
  });

  it('distinguishes an item whose id differs from its visible text', () => {
    const onChange = vi.fn();
    const media: PoolItem[] = [
      { id: 'i_olives', text: 'olives' },
      { id: 'i_honey', text: 'honey' },
    ];
    render(
      <SelectRenderer slot={slot} items={media} value={[]} onChange={onChange} />,
    );

    fireEvent.change(box(), { target: { value: 'i_honey' } });

    // Reporting the label would have produced `['honey']` and graded wrong.
    expect(onChange).toHaveBeenCalledWith(['i_honey']);
  });

  it('reflects a controlled value', () => {
    render(
      <SelectRenderer
        slot={slot}
        items={items}
        value={['an']}
        onChange={vi.fn()}
      />,
    );

    expect(box().value).toBe('an');
  });

  it('CLEARS the answer when the placeholder is re-selected', () => {
    const onChange = vi.fn();
    render(
      <SelectRenderer
        slot={slot}
        items={items}
        value={['some']}
        onChange={onChange}
      />,
    );

    fireEvent.change(box(), { target: { value: '' } });

    // `[]`, never `['']`. An empty-string id matches no pool item, so it would
    // grade as a WRONG answer instead of as no answer at all — and it would
    // unlock submit, re-arming the non-attempt bug slice 1c closed.
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('falls back to the item id when a pool item carries no text', () => {
    const onChange = vi.fn();
    const bare: PoolItem[] = [{ id: 'x' }];
    render(
      <SelectRenderer slot={slot} items={bare} value={[]} onChange={onChange} />,
    );

    // A media-only pool item still needs a selectable, nameable option rather
    // than a blank row the learner cannot tell apart from the placeholder.
    expect(screen.getByRole('option', { name: 'x' })).toBeTruthy();
  });

  it('locks the dropdown once disabled', () => {
    render(
      <SelectRenderer
        slot={slot}
        items={items}
        value={['some']}
        onChange={vi.fn()}
        disabled
      />,
    );

    // A REAL attribute, not a dimmed style. A synthetic `change` would bypass it
    // in jsdom, so asserting the attribute is what actually pins the contract:
    // the browser refuses the interaction, not our handler.
    expect(box().hasAttribute('disabled')).toBe(true);
    expect(box().disabled).toBe(true);
  });
});

/**
 * The inline layout. `olives` above carries no marker, so every test up to here
 * also proves the stacked path is untouched when there is no blank to splice.
 */
const blankSlot: Slot = {
  id: 'olives_qty',
  label: 'I would like ___ olives, please.',
  input: 'select',
  pool: 'quantifiers',
  answer: ['some'],
};

describe('SelectRenderer — label with a blank', () => {
  it('renders the sentence around the dropdown, with no marker left on screen', () => {
    render(
      <SelectRenderer
        slot={blankSlot}
        items={items}
        value={[]}
        onChange={vi.fn()}
      />,
    );

    const sentence = screen.getByTestId('slot-sentence-olives_qty');
    expect(sentence.textContent).toContain('I would like');
    expect(sentence.textContent).toContain('olives, please.');
    expect(sentence.textContent).not.toContain('___');
  });

  it('splices the dropdown into the sentence where the blank was', () => {
    render(
      <SelectRenderer
        slot={blankSlot}
        items={items}
        value={[]}
        onChange={vi.fn()}
      />,
    );

    const sentence = screen.getByTestId('slot-sentence-olives_qty');
    const nodes = Array.from(sentence.childNodes);
    const at = nodes.indexOf(box());

    expect(at).toBeGreaterThan(-1);
    expect(nodes.slice(0, at).map((n) => n.textContent).join('')).toBe(
      'I would like ',
    );
    expect(nodes.slice(at + 1).map((n) => n.textContent).join('')).toBe(
      ' olives, please.',
    );
  });

  it('keeps an accessible name via aria-label once inline', () => {
    const { container } = render(
      <SelectRenderer
        slot={blankSlot}
        items={items}
        value={[]}
        onChange={vi.fn()}
      />,
    );

    // NOT `aria-labelledby` pointing at the sentence. Under the accname
    // algorithm a referenced subtree containing a `combobox` folds that
    // combobox's OWN selected option into the name, so the dropdown would
    // announce the learner's current answer as part of the question.
    expect(
      screen.getByRole('combobox', { name: 'I would like ___ olives, please.' }),
    ).toBeTruthy();
    expect(container.querySelector('label[for="olives_qty-select"]')).toBeNull();
  });

  it('reports the same ITEM ID from the inline layout', () => {
    const onChange = vi.fn();
    render(
      <SelectRenderer
        slot={blankSlot}
        items={items}
        value={[]}
        onChange={onChange}
      />,
    );

    fireEvent.change(box(), { target: { value: 'some' } });

    // Presentation only: identical to the stacked assertion above.
    expect(onChange).toHaveBeenCalledWith(['some']);
  });

  it('still CLEARS the answer from the inline layout', () => {
    const onChange = vi.fn();
    render(
      <SelectRenderer
        slot={blankSlot}
        items={items}
        value={['some']}
        onChange={onChange}
      />,
    );

    fireEvent.change(box(), { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('keeps the placeholder option in the inline layout', () => {
    render(
      <SelectRenderer
        slot={blankSlot}
        items={items}
        value={[]}
        onChange={vi.fn()}
        placeholder="Elegir una opción"
      />,
    );

    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(box().value).toBe('');
  });

  it('locks the inline dropdown once disabled', () => {
    render(
      <SelectRenderer
        slot={blankSlot}
        items={items}
        value={['some']}
        onChange={vi.fn()}
        disabled
      />,
    );

    expect(box().disabled).toBe(true);
  });
});
